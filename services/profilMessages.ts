// services/profilMessages.ts
// [PROFIL-ABIME-SIMPLE] Phrase affichée quand un profil sauvegardé ne peut pas être lu.
// Le détail technique (message d'erreur de lecture) va dans le journal, pas à l'écran.

export function phraseProfilAbime(nom: string): string {
    return `Le profil « ${nom} » est abîmé, impossible de le charger`;
}
