interface Props { value: string; onChange: (v: string) => void }

export function SearchBar({ value, onChange }: Props) {
  return (
    <div className="relative flex items-center">
      <input
        type="search"
        className="w-full border rounded-lg px-3 py-2 text-sm pr-8"
        placeholder="Search your feed…"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {value && (
        <button
          aria-label="clear"
          onClick={() => onChange('')}
          className="absolute right-2 text-gray-400 hover:text-gray-700 text-xs"
        >✕</button>
      )}
    </div>
  )
}
