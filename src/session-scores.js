// Session-only first-place totals. Identity is a player/seat ID, never an outfit.
export function createSessionScores(){
  const totals=new Map(),awarded=new Set();
  return {
    record(roundId,winnerId){
      if(roundId===undefined||roundId===null||typeof winnerId!=='string'||!winnerId||awarded.has(roundId))return false;
      awarded.add(roundId);totals.set(winnerId,(totals.get(winnerId)||0)+1);return true;
    },
    wins:playerId=>totals.get(playerId)||0,
  };
}
