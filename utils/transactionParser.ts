
import { Transaction } from "../types";

/**
 * Vrai SI le libellé désigne un transfert INTERNE entre comptes propres (à exclure
 * du cashflow et à NE PAS catégoriser). Un Interac e-Transfer vise une PERSONNE
 * (loyer, revenu, remboursement entre proches) → PAS un transfert interne ; idem
 * « money/funds transfer » (paiement/revenu externe). Partagé par parseBankCsv et
 * categorizeBatch pour une détection COHÉRENTE (régression vue sur relevé réel :
 * 83/97 « transferts » étaient en fait des Interac/mouvements externes).
 */
export const isInternalTransferLabel = (text: string): boolean => {
  const t = (text || '').toLowerCase();
  if (/interac|e-transfer/.test(t)) return false;          // paiement/revenu entre personnes
  if (/money transfer|funds transfer/.test(t)) return false; // mouvement externe (envoi/réception)
  return /virement|transfert|transfer/.test(t);            // vrai transfert interne (incl. AccèsD)
};

// Helper to check if two payee strings are likely the same
const arePayeesSimilar = (p1: string, p2: string): boolean => {
  if (!p1 || !p2) return p1 === p2;

  const normalize = (s: string) => s.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const n1 = normalize(p1);
  const n2 = normalize(p2);

  if (n1 === n2) return true;
  if (!n1 || !n2) return false;

  // Check for substring if length is sufficient
  if (n1.length > 3 && n2.length > 3) {
    if (n1.includes(n2) || n2.includes(n1)) return true;
  }

  // Token overlap
  const t1 = n1.split(' ').filter(x => x.length > 2);
  const t2 = n2.split(' ').filter(x => x.length > 2);

  if (t1.length === 0 || t2.length === 0) return false;

  const intersection = t1.filter(x => t2.includes(x));

  // High overlap required
  const minTokens = Math.min(t1.length, t2.length);
  // If we match majority of the tokens of the shorter string
  if (intersection.length >= Math.ceil(minTokens * 0.6)) return true;

  return false;
};

export const markDuplicates = (transactions: Transaction[]): Transaction[] => {
  // 0. Reset all duplicate flags first to allow re-evaluation
  const freshList = transactions.map(t => ({ ...t, isDuplicate: false }));

  // 1. Sort by date ascending to ensure we compare chronologically for detection
  const sorted = freshList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Store "Active" transactions to compare against (these are the unique ones we keep)
  // We use the reference to the object in 'sorted' so modifications reflect there.
  const activeTransactions: Transaction[] = [];

  for (const current of sorted) {
    let isDuplicate = false;

    // Look back at the "active" list (simulating the unique list)
    // We iterate backwards to find the closest time matches first
    for (let i = activeTransactions.length - 1; i >= 0; i--) {
      const existing = activeTransactions[i];

      const timeDiff = Math.abs(new Date(current.date).getTime() - new Date(existing.date).getTime());
      const daysDiff = timeDiff / (1000 * 3600 * 24);

      // Optimization: If > 5 days apart (increased from 3), unlikely to be a duplicate
      if (daysDiff > 5) break;

      // Duplicate Criteria
      const sameAmount = Math.abs(current.amount - existing.amount) < 0.02;
      const similarPayee = arePayeesSimilar(current.payee, existing.payee);

      if (sameAmount && similarPayee) {
        // MATCH FOUND
        isDuplicate = true;

        // Smart Resolution:
        // If "current" has more info than "existing", we should swap them.
        // We make "existing" the duplicate, and "current" the active one in the unique list.

        // Scoring: 
        // 1. High ID (likely API) > Low ID (likely manual)
        // 2. Categorized > Uncategorized
        // 3. Has Account Name > Unknown
        // 4. Longer Payee > Shorter Payee

        const getScore = (t: Transaction) => {
          let score = 0;
          if (t.id > 100000) score += 10; // Prefer API IDs (LunchMoney IDs are usually large integers)
          if (t.category && t.category !== 'Uncategorized') score += 2;
          if (t.accountName && t.accountName !== 'Unknown') score += 1;
          if (t.payee.length > 5) score += 0.5;
          return score;
        };

        const currentScore = getScore(current);
        const existingScore = getScore(existing);

        if (currentScore > existingScore) {
          // Current is better.
          // Mark the PREVIOUS one as duplicate
          existing.isDuplicate = true;
          // Current becomes the 'active' unique one
          current.isDuplicate = false;
          // Replace in active list
          activeTransactions[i] = current;
        } else {
          // Existing is better or equal.
          // Current is the duplicate
          current.isDuplicate = true;
        }

        break; // Found match, stop checking
      }
    }

    if (!isDuplicate) {
      current.isDuplicate = false;
      activeTransactions.push(current);
    }
  }

  // Return sorted descending (Newest first) for display
  return sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const parseTransactions = (rawData: string): Transaction[] => {
  const lines = rawData.trim().split('\n');
  const transactions: Transaction[] = [];

  // Skip header if it detects "Date" in the first line
  const startIndex = lines[0].toLowerCase().includes('date') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Détection du séparateur : tabulation > point-virgule > virgule.
    // L'ordre compte : les CSV FR (Excel Québec) utilisent ';' car la virgule y
    // est le séparateur décimal ; la virgule en dernier recours couvre les
    // exports nord-américains standards (décimale = point).
    let parts = line.split('\t');
    if (parts.length < 2) parts = line.split(';');
    if (parts.length < 2) parts = line.split(',');

    if (parts.length >= 2) {
      try {
        const dateRaw = parts[0].trim();
        const payee = parts[1].trim();
        // Handle cases where columns might be missing or shifted
        const amountRaw = parts[2]?.trim() || "0";
        const categoryRaw = parts[3]?.trim() || "Uncategorized";
        const account = parts[4]?.trim() || "Unknown";

        // Parse Date (DD/MM/YYYY)
        const dateParts = dateRaw.split('/');
        if (dateParts.length !== 3) continue;

        const [day, month, year] = dateParts.map(Number);
        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Parse Amount
        const cleanAmount = amountRaw
          .replace(/\s/g, '')
          .replace(/\u00A0/g, '')
          .replace('$', '')
          .replace(',', '.');

        const amount = parseFloat(cleanAmount);

        if (!isNaN(amount) && isoDate) {

          // --- LOGIC: INTERAC HANDLING ---
          const lowerCat = categoryRaw.toLowerCase();
          const lowerPayee = payee.toLowerCase();
          const isInterac = lowerCat.includes('interac') || lowerCat.includes('e-transfer') || lowerPayee.includes('interac') || lowerPayee.includes('e-transfer');

          let finalCategory = categoryRaw;
          let isTransfer = false;

          if (isInterac) {
            // Interac is Reimbursement (Expense/Income), NOT a Transfer
            finalCategory = "Remboursement";
            isTransfer = false;
          } else {
            // Standard Transfer Detection
            isTransfer = lowerCat.includes('virement') || lowerCat.includes('transfert');
          }

          // ID unique basé sur timestamp + index + hash contenu pour éviter collisions entre imports
          const uniqueId = -(Date.now() * 1000 + i); // Négatif pour distinguer des IDs LunchMoney (positifs grands)
          transactions.push({
            id: uniqueId,
            date: isoDate,
            payee: payee,
            amount: amount,
            category: finalCategory,
            originalCategory: categoryRaw,
            accountName: account || "Unknown",
            status: 'processed',
            isTransfer: isTransfer,
            isDuplicate: false
          });
        }
      } catch (e) {
        console.warn(`Failed to parse line ${i}: ${line}`, e);
      }
    }
  }

  // Apply duplicate marking
  return markDuplicates(transactions);
};
