import type { ArticleWithMeta } from '../types'

interface Props {
  credibility?: ArticleWithMeta['credibility']
}

export function CredibilityBadge({ credibility }: Props) {
  if (!credibility) return null

  let label: string
  let colorClass: string

  if (credibility.score >= 0.80) {
    label = 'Trusted'
    colorClass = 'bg-green-100 text-green-800'
  } else if (credibility.score >= 0.50) {
    label = 'Unverified'
    colorClass = 'bg-yellow-100 text-yellow-800'
  } else {
    label = 'Flagged'
    colorClass = 'bg-red-100 text-red-800'
  }

  return (
    <span
      className={`text-xs rounded-full px-2 py-0.5 font-medium ${colorClass}`}
      title={credibility.explanation}
    >
      {label}
    </span>
  )
}
