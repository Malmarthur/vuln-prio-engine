interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, perPage, total, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  if (totalPages <= 1) return null;

  // Build page number list with ellipsis
  const pages: number[] = [];
  const addPage = (n: number) => {
    if (n >= 1 && n <= totalPages && !pages.includes(n)) pages.push(n);
  };

  addPage(1);
  for (let i = page - 1; i <= page + 1; i++) addPage(i);
  addPage(totalPages);
  pages.sort((a, b) => a - b);

  // Insert ellipsis markers
  const items: (number | string)[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) items.push('...');
    items.push(pages[i]);
  }

  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <span className="text-gray-500">
        {total.toLocaleString()} result{total !== 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        {items.map((item, i) =>
          item === '...' ? (
            <span key={`e${i}`} className="px-1 text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(item as number)}
              className={`px-2.5 py-1 rounded border text-sm ${
                item === page
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item}
            </button>
          ),
        )}
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
