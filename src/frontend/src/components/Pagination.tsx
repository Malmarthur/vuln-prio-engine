interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, perPage, total, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));

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

  const buttonClass = 'min-w-[1.75rem] border px-1.5 py-0.5 font-mono text-xs';

  // Rendered as a table footer: always shows the result count.
  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-300 bg-gray-50 px-4 py-2 text-xs">
      <span className="font-mono text-gray-600">
        {total.toLocaleString()} result{total !== 1 ? 's' : ''}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            className="btn-secondary btn-sm"
          >
            Prev
          </button>
          {items.map((item, i) =>
            item === '...' ? (
              <span key={`e${i}`} className="px-1 text-gray-400">
                …
              </span>
            ) : (
              <button
                key={item}
                onClick={() => onChange(item as number)}
                aria-current={item === page ? 'page' : undefined}
                className={`${buttonClass} ${
                  item === page
                    ? 'border-accent-700 bg-accent-700 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item}
              </button>
            ),
          )}
          <button
            disabled={page >= totalPages}
            onClick={() => onChange(page + 1)}
            className="btn-secondary btn-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
