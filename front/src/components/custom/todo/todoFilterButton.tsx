interface TodoFilterButtonProps {
  label: string
  active: boolean
  count: number
  onClick: () => void
}

export const FilterButton = ({
  label,
  count,
  active,
  onClick,
}: TodoFilterButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer flex gap-1.5 items-center"
    >
      <div
        className={`transition duration-200 ${
          active ? 'text-primary' : 'text-text-light'
        }`}
      >
        {label}
      </div>
      <div
        className={`transition duration-200 text-sm rounded-xl px-2.5 text-background ${
          active ? 'bg-primary' : 'bg-text-light/30'
        }`}
      >
        {count}
      </div>
    </button>
  )
}
