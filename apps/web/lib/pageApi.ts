// API client for editor — calls to apps/web Next.js API routes

interface ImageFile {
  key: string;
  name: string;
  url: string;
  size: number;
  lastModified?: string;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

const apiCall = async <T = any>(url: string, options: RequestInit = {}): Promise<T> => {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
  return res.json();
};

// ─── Save page JSON ──────────────────────────────────────────────────────────

export const savePage = async (code: string, content: string): Promise<ApiResponse> => {
  try {
    const url = (typeof window !== "undefined" && (window as any).data?.saveUrl)
      ? (window as any).data.saveUrl
      : `/api/funnel-steps/${code}`;
    return await apiCall(url, {
      method: "PATCH",
      body: JSON.stringify({ pageJson: content }),
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Save failed" };
  }
};

// ─── Media ───────────────────────────────────────────────────────────────────

export const getImages = async (
  pageCode?: string,
  limit = 20,
  continuationToken?: string
): Promise<{ success: boolean; files: ImageFile[]; has_more: boolean; next_token: string | null; total_count: number; error?: string }> => {
  try {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (pageCode) params.append("page_code", pageCode);
    if (continuationToken) params.append("continuation_token", continuationToken);

    const result = await apiCall(`/api/media?${params}`, { method: "GET" });
    return {
      success: result.success ?? false,
      files: result.data?.files ?? [],
      has_more: result.data?.hasMore ?? false,
      next_token: result.data?.nextToken ?? null,
      total_count: result.data?.total ?? 0,
    };
  } catch (error) {
    return { success: false, files: [], has_more: false, next_token: null, total_count: 0, error: String(error) };
  }
};

export const uploadImage = async (file: File, pageCode?: string): Promise<{ success: boolean; url: string; key: string; message: string }> => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    if (pageCode) formData.append("page_code", pageCode);

    const res = await fetch("/api/media/upload", { method: "POST", body: formData });
    const result = await res.json();
    return { success: result.success ?? false, url: result.data?.url ?? "", key: result.data?.key ?? "", message: result.message ?? "" };
  } catch (error) {
    return { success: false, url: "", key: "", message: String(error) };
  }
};

export const deleteImage = async (fileKey: string): Promise<{ success: boolean; message: string }> => {
  try {
    const result = await apiCall("/api/media/delete", { method: "POST", body: JSON.stringify({ key: fileKey }) });
    return { success: result.success ?? false, message: result.message ?? "" };
  } catch (error) {
    return { success: false, message: String(error) };
  }
};

// ─── Coupon ───────────────────────────────────────────────────────────────────

export const validateCoupon = async (code: string): Promise<{ valid: boolean; discount: number; type: "percentage" | "fixed"; message?: string }> => {
  try {
    const result = await apiCall("/api/coupons/validate", { method: "POST", body: JSON.stringify({ code }) });
    return { valid: result.data?.valid ?? false, discount: result.data?.discount ?? 0, type: result.data?.type ?? "percentage", message: result.message };
  } catch (error) {
    return { valid: false, discount: 0, type: "percentage", message: String(error) };
  }
};

export type { ImageFile, ApiResponse };
