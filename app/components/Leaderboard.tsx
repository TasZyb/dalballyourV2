type Player = {
  id: string
  name: string
  weightedPoints: number
  exactHits: number
  correctResults: number
  predictionsCount: number
}

export default function Leaderboard({ players }: { players: Player[] }) {

  return (

    <section>

      <h2 className="mb-4 text-xl font-black">
        Leaderboard
      </h2>

      <div className="space-y-3">

        {players.map((player, index) => (

          <div
            key={player.id}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
          >

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 font-black">
              #{index + 1}
            </div>

            <div>

              <div className="font-bold">
                {player.name}
              </div>

              <div className="text-sm text-white/50">
                Exact: {player.exactHits} · Results: {player.correctResults} · Predictions: {player.predictionsCount}
              </div>

            </div>

            <div className="text-right">

              <div className="text-xs text-white/40 uppercase">
                Points
              </div>

              <div className="text-xl font-black">
                {player.weightedPoints}
              </div>

            </div>

          </div>

        ))}

      </div>

    </section>

  )

}