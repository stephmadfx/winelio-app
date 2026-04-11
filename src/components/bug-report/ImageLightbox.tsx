"use client";

interface ImageLightboxProps {
  url: string;
  onClose: () => void;
}

export const ImageLightbox = ({ url, onClose }: ImageLightboxProps) => (
  <div
    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    onClick={onClose}
  >
    <button
      type="button"
      onClick={onClose}
      className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
      aria-label="Fermer"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
    <img
      src={url}
      alt="Pièce jointe"
      className="max-w-[92vw] max-h-[88vh] rounded-xl shadow-2xl object-contain animate-in zoom-in-95 duration-200"
      onClick={(e) => e.stopPropagation()}
    />
  </div>
);
