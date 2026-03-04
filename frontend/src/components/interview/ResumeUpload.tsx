"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, FileText, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractTextFromPDF, validatePDFFile } from "@/lib/pdf";
import { cn } from "@/lib/utils";

interface ResumeUploadProps {
  value: string;
  onChange: (text: string) => void;
}

export default function ResumeUpload({ value, onChange }: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function processFile(file: File) {
    setError(null);

    const validationError = validatePDFFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setFileName(file.name);
    setFileSize(formatSize(file.size));

    try {
      const text = await extractTextFromPDF(file);
      onChange(text);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to extract text from PDF.";
      setError(message);
      setFileName(null);
      setFileSize(null);
    } finally {
      setLoading(false);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleClear() {
    onChange("");
    setFileName(null);
    setFileSize(null);
    setError(null);
  }

  if (loading) {
    return (
      <div className="glass rounded-xl p-8 flex flex-col items-center justify-center gap-3 min-h-45">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-center">
          <p className="text-sm font-medium">Extracting text...</p>
          <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
        </div>
      </div>
    );
  }

  if (value) {
    return (
      <div className="space-y-3">
        {fileName && (
          <div className="flex items-center justify-between glass rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">{fileSize}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="relative">
          <p className="text-xs text-muted-foreground mb-1.5">
            Extracted text preview (editable):
          </p>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={8}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">
            {value.length.toLocaleString()} characters
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "glass rounded-xl p-8 flex flex-col items-center justify-center gap-3 min-h-45 cursor-pointer transition-all duration-200",
          dragging && "border-primary/50 bg-primary/5 glow",
          error && "border-destructive/30"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Upload className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">
            Drop your PDF here or{" "}
            <span className="text-primary">browse</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF only, up to 10MB
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}