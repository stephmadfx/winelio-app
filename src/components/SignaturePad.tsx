"use client";
import SignaturePadLib from "signature_pad";
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

export interface SignaturePadRef {
  isEmpty(): boolean;
  toDataURL(): string;
  clear(): void;
}

const SignaturePad = forwardRef<SignaturePadRef, { className?: string }>(
  ({ className }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePadLib | null>(null);

    useEffect(() => {
      if (!canvasRef.current) return;
      padRef.current = new SignaturePadLib(canvasRef.current, {
        backgroundColor: "rgb(255,255,255)",
      });
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      return () => padRef.current?.off();
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataURL: () => padRef.current?.toDataURL() ?? "",
      clear: () => padRef.current?.clear(),
    }));

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ touchAction: "none" }}
      />
    );
  }
);
SignaturePad.displayName = "SignaturePad";
export default SignaturePad;
