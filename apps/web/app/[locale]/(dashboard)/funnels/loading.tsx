export default function FunnelsLoading() {
  return (
    <div className="p-8 animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-7 w-28 bg-gray-200 rounded-lg mb-2" />
          <div className="h-4 w-52 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-32 bg-gray-200 rounded-lg" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 bg-white rounded-xl border border-gray-100">
            <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0" />
            <div className="flex-1">
              <div className="h-4 w-48 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
