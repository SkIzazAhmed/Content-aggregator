import type { Category } from '../types'

interface Props {
  categories: Category[]
  selectedId: number | null
  onSelect: (id: number | null) => void
}

export function CategoryToggle({ categories, selectedId, onSelect }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onSelect(null)}
        className={`text-xs rounded-full px-3 py-1 border font-medium transition-colors
          ${selectedId === null ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
      >
        All
      </button>
      {categories.map(c => (
        <button
          key={c.id}
          onClick={() => onSelect(selectedId === c.id ? null : c.id)}
          className="text-xs rounded-full px-3 py-1 border font-medium transition-colors"
          style={selectedId === c.id
            ? { background: c.color, color: '#fff', borderColor: c.color }
            : { color: c.color, borderColor: c.color + '60' }}
        >
          {c.name}
        </button>
      ))}
    </div>
  )
}
