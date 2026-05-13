export default function FunnelDetailLoading() {
  return (
    <div className="flex h-full animate-pulse overflow-hidden">
      {/* Left sidebar skeleton */}
      <div className="w-72 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="h-3 w-32 bg-gray-100 rounded mb-2" />
          <div className="h-4 w-44 bg-gray-200 rounded" />
        </div>
        <div className="flex-1 divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-3">
              <div className="w-3 h-4 bg-gray-100 rounded" />
              <div className="w-8 h-8 bg-gray-100 rounded-lg shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 w-28 bg-gray-200 rounded mb-1.5" />
                <div className="h-2.5 w-20 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-gray-100">
          <div className="h-9 w-full bg-gray-100 rounded-lg" />
        </div>
      </div>

      {/* Right panel skeleton */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="h-3 w-48 bg-gray-100 rounded" />
            <div className="flex gap-2">
              <div className="h-8 w-32 bg-gray-200 rounded-lg" />
              <div className="h-8 w-24 bg-gray-200 rounded-lg" />
              <div className="h-8 w-36 bg-gray-200 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-1 overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={`h-9 rounded ${i === 0 ? "w-28 bg-gray-200" : "w-24 bg-gray-100"}`} />
            ))}
          </div>
        </div>
        <div className="p-6">
          <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-6">
            <div className="h-4 w-12 bg-gray-100 rounded mb-2" />
            <div className="h-9 w-full bg-gray-100 rounded-lg mb-5" />
            <div className="h-4 w-16 bg-gray-100 rounded mb-2" />
            <div className="h-9 w-full bg-gray-100 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
