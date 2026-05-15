import React from 'react';

export const ExpertTooltip = ({ active, payload, isPrivacyMode, userName1, userName2 }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;

    return (
        <div className="bg-[#0B0E14]/95 backdrop-blur-md border border-white/20 p-4 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] max-w-sm z-50">
            <div className="text-sm font-bold text-white mb-2 border-b border-white/20 pb-2 flex justify-between items-center">
                <span>{data.dateLabel || 'N/A'}</span>
                <span className="text-[10px] text-gray-400 bg-white/10 px-2 py-0.5 rounded">Âge: {data.age || '??'}</span>
            </div>

            <div className="mb-3 space-y-1">
                {(data.IncomeMarc || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Paye {userName1 || 'Utilisateur 1'}:</span> <span className="font-mono text-green-400 privacy-blur">+{(data.IncomeMarc || 0).toLocaleString()}$</span></div>}
                {(data.IncomeAnna || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Paye {userName2 || 'Utilisateur 2'}:</span> <span className="font-mono text-green-400 privacy-blur">+{(data.IncomeAnna || 0).toLocaleString()}$</span></div>}
                {(data.IncomeRetirement || 0) > 0 && <div className="flex justify-between text-xs"><span className="text-gray-400">Rentes/Retraite:</span> <span className="font-mono text-green-400 privacy-blur">+{(data.IncomeRetirement || 0).toLocaleString()}$</span></div>}

                <div className="flex justify-between text-xs"><span className="text-gray-400">Dépenses Vies:</span> <span className="font-mono text-red-400 privacy-blur">-{(data.Expenses || 0).toLocaleString()}$</span></div>

                {(data.childGross || 0) > 0 && (
                    <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500 pl-2">↳ dt. Enfant:</span>
                        <span className="font-mono text-red-300 privacy-blur text-right">
                            -{(data.childGross || 0).toLocaleString()}$
                            {(data.childBenefits || 0) > 0 && <span className="text-green-400 ml-1">(+{(data.childBenefits || 0)}$ alloc)</span>}
                        </span>
                    </div>
                )}
                {(data.ReeeContrib || 0) > 0 && <div className="flex justify-between text-[10px]"><span className="text-gray-500 pl-2">↳ dt. Épargne REEE:</span> <span className="font-mono text-blue-300 privacy-blur">{(data.ReeeContrib || 0)}$ (+30% gouv)</span></div>}

                {(data.ImmoHypo || 0) > 0 && (
                    <div className="flex flex-col text-[10px]">
                        <div className="flex justify-between">
                            <span className="text-gray-500 pl-2">↳ dt. Maison:</span>
                            <span className="font-mono text-pink-300 privacy-blur">Hypo {(data.ImmoHypo || 0).toLocaleString()}$ | Chg {(data.ImmoCharges || 0).toLocaleString()}$</span>
                        </div>
                        <div className="flex justify-end text-[9px] text-gray-500 mt-0.5 font-mono">
                            (Capital: <span className="text-green-400/80 mx-1">+{(data.ImmoPrincipal || 0).toLocaleString()}$</span> Intérêts: <span className="text-red-400/80 ml-1">-{(data.ImmoInterest || 0).toLocaleString()}$</span>)
                        </div>
                    </div>
                )}
                {(data.ImmoHypo || 0) === 0 && (data.ImmoCharges || 0) > 0 && (
                    <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500 pl-2">↳ dt. Maison (Payée):</span>
                        <span className="font-mono text-pink-300 privacy-blur">Chg {(data.ImmoCharges || 0).toLocaleString()}$</span>
                    </div>
                )}

                <div className="flex justify-between text-xs font-bold border-t border-white/10 pt-1 mt-1">
                    <span className="text-gray-300">Var. Nette (Mois):</span>
                    <span className={`font-mono privacy-blur ${(data.diffNW || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(data.diffNW || 0) > 0 ? '+' : ''}{(data.diffNW || 0).toLocaleString()}$
                    </span>
                </div>

                <div className="grid grid-cols-3 gap-1 mt-1 text-[9px] text-gray-400 border-b border-white/5 pb-2 mb-2">
                    <div className="text-center bg-white/5 rounded py-0.5">Cash: <br/><span className={(data.diffLiquid || 0) >= 0 ? 'text-green-300' : 'text-red-300'}>{(data.diffLiquid || 0) > 0 ? '+' : ''}{(data.diffLiquid || 0)}$</span></div>
                    <div className="text-center bg-white/5 rounded py-0.5">CELI: <br/><span className={(data.diffCELI || 0) >= 0 ? 'text-green-300' : 'text-red-300'}>{(data.diffCELI || 0) > 0 ? '+' : ''}{(data.diffCELI || 0)}$</span></div>
                    <div className="text-center bg-white/5 rounded py-0.5">REER: <br/><span className={(data.diffREER || 0) >= 0 ? 'text-green-300' : 'text-red-300'}>{(data.diffREER || 0) > 0 ? '+' : ''}{(data.diffREER || 0)}$</span></div>
                </div>
            </div>

            <div className="bg-black/30 p-2 rounded-lg space-y-1.5 text-xs text-white border border-white/5 mb-3">
                <div className="flex justify-between"><span className="text-gray-500">Cash (Coussin):</span> <span className="font-mono privacy-blur">{(data.Liquidites || 0).toLocaleString()}$</span></div>
                <div className="flex justify-between"><span className="text-green-500">CELI:</span> <span className="font-mono privacy-blur">{(data.CELI || 0).toLocaleString()}$</span></div>
                <div className="flex justify-between"><span className="text-blue-500">REER:</span> <span className="font-mono privacy-blur">{(data.REER || 0).toLocaleString()}$</span></div>
                {(data.REEE || 0) > 0 && <div className="flex justify-between"><span className="text-cyan-400">REEE (Études):</span> <span className="font-mono privacy-blur">{(data.REEE || 0).toLocaleString()}$</span></div>}
                <div className="flex justify-between"><span className="text-orange-500">Non-Enreg:</span> <span className="font-mono privacy-blur">{(data.NonReg || 0).toLocaleString()}$</span></div>
                {(data.Crypto || 0) > 0 && <div className="flex justify-between"><span className="text-purple-500">Crypto:</span> <span className="font-mono privacy-blur">{(data.Crypto || 0).toLocaleString()}$</span></div>}
                <div className="flex justify-between"><span className="text-pink-500">Immobilier:</span> <span className="font-mono privacy-blur">{(data.Immobilier || 0).toLocaleString()}$</span></div>
            </div>

            <div className="flex justify-between font-black text-sm text-white bg-white/10 p-2 rounded border border-white/20">
                <span>Valeur Nette:</span> <span className="font-mono privacy-blur">{(data.NetWorth || 0).toLocaleString()}$</span>
            </div>

            {((data.ImpotLatent || 0) < 0 || (data.FluxImpots || 0) < 0) && (
                <div className="mt-2 space-y-1">
                    {(data.ImpotLatent || 0) < 0 && <div className="flex justify-between text-xs"><span className="text-red-500 font-bold">Impôt Latent (Dette):</span> <span className="font-mono text-red-400 privacy-blur">{(data.ImpotLatent || 0).toLocaleString()}$</span></div>}
                    {(data.FluxImpots || 0) < 0 && <div className="flex justify-between text-xs"><span className="text-red-500 font-bold">Impôt Payé (Avril):</span> <span className="font-mono text-red-400 privacy-blur">{(data.FluxImpots || 0).toLocaleString()}$</span></div>}
                </div>
            )}

            {(data.lifeEvents?.length > 0 || data.flowEvents?.length > 0) && (
                <div className="mt-3 pt-2 border-t border-white/20">
                    {data.lifeEvents?.length > 0 && (
                        <div className="mb-2">
                            <span className="text-[9px] uppercase text-yellow-500 font-bold tracking-widest">Événements</span>
                            <ul className="text-xs text-yellow-300 mt-1 font-bold space-y-1">
                                {data.lifeEvents?.map((e: string, i: number) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}
                    {data.flowEvents?.length > 0 && (
                        <div>
                            <span className="text-[9px] uppercase text-gray-500 font-bold tracking-widest">Flux d'Épargne</span>
                            <ul className="text-[10px] text-gray-300 mt-1 space-y-1 font-mono">
                                {data.flowEvents?.map((e: string, i: number) => <li key={i} className={e.includes('Survie') ? 'text-red-300' : 'text-blue-300'}>⫪ {e}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const CustomLifeEventLabel = (props: any) => {
    const { x, y, value, index } = props;
    const dyOffsets = [-25, -45, -65, 25, 45];
    const dy = dyOffsets[index % dyOffsets.length];
    return (
        <text x={x} y={y} dy={dy} fill="#facc15" fontSize={11} textAnchor="middle" fontWeight="black" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))' }}>
            {value}
        </text>
    );
};

export const CustomFlowEventLabel = (props: any) => {
    const { x, y, value } = props;
    return (
        <text x={x} y={y} dy={-10} fill="#60a5fa" fontSize={8} textAnchor="middle" opacity={0.6}>
            {value}
        </text>
    );
};
