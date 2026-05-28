// API client for elements package
// All paths are relative — works when elements are used inside any Next.js app

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

const apiCall = async <T = any>(url: string, options: RequestInit = {}): Promise<T> => {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
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

export interface ImageFile {
  key: string;
  name: string;
  url: string;
  size: number;
  lastModified?: string;
  /** Asset id when the file has a tracked DB row (new uploads). null for legacy
   * files that exist on storage but were not registered as Asset. */
  assetId?: string | null;
}

export const getImages = async (
  folder?: string,
  limit = 20,
  continuationToken?: string
): Promise<{ success: boolean; files: ImageFile[]; has_more: boolean; next_token: string | null; total_count: number; folders: string[]; error?: string }> => {
  try {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (folder) params.append("folder", folder);
    if (continuationToken) params.append("continuation_token", continuationToken);

    const result = await apiCall(`/api/media?${params}`, { method: "GET" });
    return {
      success: result.success ?? false,
      files: result.data?.files ?? [],
      has_more: result.data?.hasMore ?? false,
      next_token: result.data?.nextToken ?? null,
      total_count: result.data?.total ?? 0,
      folders: result.data?.folders ?? [],
    };
  } catch (error) {
    return { success: false, files: [], has_more: false, next_token: null, total_count: 0, folders: [], error: String(error) };
  }
};

export const uploadImage = async (
  file: File,
  folder?: string
): Promise<{ success: boolean; url: string; key: string; assetId: string | null; message: string }> => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    if (folder) formData.append("folder", folder);

    const res = await fetch("/api/media/upload", { method: "POST", body: formData });
    const result = await res.json();
    return {
      success: result.success ?? false,
      url:     result.data?.url ?? "",
      key:     result.data?.key ?? "",
      assetId: result.data?.assetId ?? null,
      message: result.message ?? "",
    };
  } catch (error) {
    return { success: false, url: "", key: "", assetId: null, message: String(error) };
  }
};

export const deleteImage = async (
  fileKey: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const result = await apiCall("/api/media/delete", {
      method: "POST",
      body: JSON.stringify({ key: fileKey }),
    });
    return { success: result.success ?? false, message: result.message ?? "" };
  } catch (error) {
    return { success: false, message: String(error) };
  }
};

// ─── Coupon ───────────────────────────────────────────────────────────────────

export const validateCoupon = async (
  code: string
): Promise<{ valid: boolean; discount: number; type: "percentage" | "fixed"; message?: string }> => {
  try {
    const funnelStepId = (window as any)?.data?.funnelStepId ?? null;
    const result = await apiCall("/api/coupons/validate", {
      method: "POST",
      body: JSON.stringify({ code, funnelStepId }),
    });
    return {
      valid: result.data?.valid ?? false,
      discount: result.data?.discount ?? 0,
      type: result.data?.type ?? "percentage",
      message: result.data?.message ?? result.message,
    };
  } catch (error) {
    return { valid: false, discount: 0, type: "percentage", message: String(error) };
  }
};
