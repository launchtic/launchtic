import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { uploadImage, deleteImage, getImages, type ImageFile } from "../../lib/pageApi";
import {
  ModalOverlay,
  ModalContainer,
  TabHeader,
  Tab,
  UploadContainer,
  ImageGridWrapper,
  ImageGrid,
  ImageItem,
  CloseButton,
  LoadingContainer,
  ErrorContainer,
  LoadMoreButton,
  ImageStats,
  ActionButton,
  BottomContainer,
} from "../common/ImageUploadModal.styles";

type Props = {
  onClose: () => void;
  /** Called when the user inserts an image. `assetId` is null when the file
   * has no tracked DB row (legacy / external URL). Caller should persist
   * both into element props for downstream clone/import flows. */
  onSelect: (url: string, assetId: string | null) => void;
};

const SpinnerIcon = ({ size = 24 }: { size?: number }) => (
  <div style={{
    width: size, height: size,
    border: `3px solid ${size > 20 ? "#f3f3f3" : "#fff"}`,
    borderTop: `3px solid ${size > 20 ? "#2196F3" : "transparent"}`,
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: size > 20 ? 8 : 0,
    flexShrink: 0,
  }} />
);

const PAGE_SIZE = 24;

const ImageUploadModal: React.FC<Props> = ({ onClose, onSelect }) => {
  const [activeTab, setActiveTab] = useState<"upload" | "yourImages">("upload");

  // ── Upload tab state ──
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedImageKey, setUploadedImageKey] = useState<string | null>(null);
  const [uploadedAssetId, setUploadedAssetId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ── Browser tab state ──
  const [userImages, setUserImages] = useState<ImageFile[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add CSS animation
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Initial load
  useEffect(() => {
    loadImages(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadImages = async (loadMore: boolean) => {
    if (loadMore) setIsLoadingMore(true);
    else { setIsLoadingImages(true); setUserImages([]); setNextToken(null); }
    setError(null);

    try {
      const result = await getImages(
        undefined,                                      // no folder filter — flat library
        PAGE_SIZE,
        loadMore ? (nextToken ?? undefined) : undefined,
      );

      if (result.success) {
        setUserImages(prev => loadMore ? [...prev, ...result.files] : result.files);
        setHasMore(result.has_more);
        setNextToken(result.next_token);
        setTotalCount(result.total_count);
      } else {
        setError(result.error ?? "Failed to load images");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load images");
    } finally {
      setIsLoadingImages(false);
      setIsLoadingMore(false);
    }
  };

  // ── Upload ──
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setIsUploading(true);
    setError(null);
    try {
      const result = await uploadImage(acceptedFiles[0]);   // flat library — no folder
      if (result.success && result.url) {
        setPreview(result.url);
        setUploadedImageKey(result.key);
        setUploadedAssetId(result.assetId);
        await loadImages(false);
      } else {
        setError(result.message || "Upload failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const handleInsertImage = () => {
    if (preview) { onSelect(preview, uploadedAssetId); onClose(); }
  };

  const handleDeleteUploadedImage = async () => {
    if (!uploadedImageKey || !window.confirm("Delete this image?")) return;
    setIsUploading(true);
    try {
      const result = await deleteImage(uploadedImageKey);
      if (result.success) {
        setPreview(null); setUploadedImageKey(null); setUploadedAssetId(null);
        await loadImages(false);
      }
      else setError(result.message || "Delete failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setIsUploading(false); }
  };

  const handleDeleteImage = async (image: ImageFile) => {
    if (!window.confirm("Delete this image?")) return;
    setDeletingKey(image.key);
    setError(null);
    try {
      const result = await deleteImage(image.key);
      if (result.success) await loadImages(false);
      else setError(result.message || "Delete failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeletingKey(null); }
  };

  return (
    <ModalOverlay>
      <ModalContainer>
        <CloseButton onClick={onClose}>✖</CloseButton>

        <TabHeader>
          <Tab $active={activeTab === "upload"} onClick={() => setActiveTab("upload")}>UPLOAD</Tab>
          <Tab $active={activeTab === "yourImages"} onClick={() => setActiveTab("yourImages")}>YOUR IMAGES</Tab>
        </TabHeader>

        {error && <ErrorContainer>{error}</ErrorContainer>}

        {/* ── UPLOAD TAB ── */}
        {activeTab === "upload" && (
          <>
            <UploadContainer {...getRootProps()} style={{ marginTop: 16 }}>
              <input {...getInputProps()} />
              {isUploading ? (
                <><SpinnerIcon /><p style={{ margin: 0, fontSize: 14 }}>Uploading...</p></>
              ) : (
                <>
                  <div style={{ fontSize: 24, marginBottom: 8, color: "#999" }}>📁</div>
                  <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
                    Drag a file or <span style={{ color: "#2196F3", textDecoration: "underline" }}>click to upload</span>
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#999" }}>PNG, JPG, GIF, WebP, SVG — max 10MB</p>
                </>
              )}
            </UploadContainer>

            {preview && (
              <div style={{ marginTop: 16 }}>
                <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8, background: "#f9f9f9", display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={preview} alt="Preview" style={{ width: 60, height: 60, borderRadius: 6, objectFit: "cover" }} />
                  <div style={{ flex: 1, fontSize: 13, color: "#333" }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{uploadedImageKey?.split("/").pop() || "Uploaded Image"}</div>
                    <div style={{ color: "#888", fontSize: 12 }}>Ready to insert</div>
                  </div>
                  <div style={{ color: "#4caf50", fontSize: 18 }}>✓</div>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
                  <ActionButton onClick={handleInsertImage}>Insert</ActionButton>
                  <ActionButton variant="danger" onClick={handleDeleteUploadedImage} disabled={isUploading}>
                    {isUploading ? "Deleting..." : "Delete"}
                  </ActionButton>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── YOUR IMAGES TAB (flat — no folders) ── */}
        {activeTab === "yourImages" && (
          <ImageGridWrapper>
            {isLoadingImages ? (
              <LoadingContainer>
                <SpinnerIcon size={36} />
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "#888" }}>Loading images…</p>
              </LoadingContainer>
            ) : (
              <>
                <ImageGrid>
                  {userImages.length > 0 ? userImages.map(image => (
                    <div key={image.key} style={{ position: "relative" }}>
                      <ImageItem
                        src={image.url}
                        alt={image.name}
                        onClick={() => { onSelect(image.url, image.assetId ?? null); onClose(); }}
                        style={{ opacity: deletingKey === image.key ? 0.4 : 1 }}
                        title={`${image.name} (${(image.size / 1024).toFixed(1)} KB)`}
                      />
                      {deletingKey === image.key && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.6)", borderRadius: 6 }}>
                          <SpinnerIcon size={20} />
                        </div>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteImage(image); }}
                        disabled={!!deletingKey}
                        title="Delete"
                        style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, background: "rgba(220,38,38,0.85)", color: "#fff", border: "none", borderRadius: "50%", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        ×
                      </button>
                    </div>
                  )) : (
                    <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", color: "#aaa" }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🖼️</div>
                      <p style={{ margin: 0, fontSize: 14, color: "#888" }}>No images yet</p>
                      <p style={{ margin: "4px 0 0", fontSize: 12 }}>Upload some images to see them here.</p>
                    </div>
                  )}
                </ImageGrid>

                <BottomContainer>
                  <ImageStats>
                    {totalCount > 0
                      ? `Showing ${userImages.length} of ${totalCount} image${totalCount !== 1 ? "s" : ""}`
                      : ""}
                  </ImageStats>
                  {hasMore && (
                    <LoadMoreButton onClick={() => loadImages(true)} disabled={isLoadingMore}>
                      {isLoadingMore
                        ? <span style={{ display: "flex", alignItems: "center", gap: 6 }}><SpinnerIcon size={14} /> Loading…</span>
                        : "Load more"}
                    </LoadMoreButton>
                  )}
                </BottomContainer>
              </>
            )}
          </ImageGridWrapper>
        )}
      </ModalContainer>
    </ModalOverlay>
  );
};

export default ImageUploadModal;
