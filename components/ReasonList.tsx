import type { ReasonType } from '@/lib/api'

const ICON: Record<ReasonType, string> = {
  positive: '✓',
  caution: '!',
  negative: '×',
}

const STYLE: Record<ReasonType, string> = {
  positive: 'bg-emerald-100 text-emerald-700',
  caution: 'bg-amber-100 text-amber-700',
  negative: 'bg-red-100 text-red-700',
}

interface ReasonListProps {
  reasons: { type: ReasonType; text: string }[]
  limit?: number
}

export function ReasonList({ reasons, limit = 3 }: ReasonListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {reasons.slice(0, limit).map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${STYLE[r.type]}`}
          >
            {ICON[r.type]}
          </span>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  )
}
