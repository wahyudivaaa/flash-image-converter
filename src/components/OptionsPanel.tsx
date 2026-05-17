"use client";

import {
  DEFAULT_WATERMARK,
  RESIZE_PRESETS,
  type ConvertOptions,
  type CropPosition,
  type ResizeFit,
  type WatermarkPosition,
} from "@/lib/formats";
import {
  Check,
  ChevronDown,
  Crop,
  Layers,
  RotateCw,
  Settings2,
  Sparkles,
  Type,
} from "lucide-react";
import { useMemo, useState } from "react";

interface OptionsPanelProps {
  options: ConvertOptions;
  setOptions: (next: ConvertOptions) => void;
}

export function OptionsPanel({ options, setOptions }: OptionsPanelProps) {
  const [open, setOpen] = useState(false);

  const setOpt = <K extends keyof ConvertOptions>(
    key: K,
    value: ConvertOptions[K],
  ) => {
    setOptions({ ...options, [key]: value });
  };

  const presetId = useMemo(() => {
    const r = options.resize;
    if (!r) return "none";
    const match = RESIZE_PRESETS.find(
      (p) => p.width === r.width && p.height === r.height && p.fit === r.fit,
    );
    return match?.id ?? "custom";
  }, [options.resize]);

  // Compact summary of active modifiers — earns a place in the header
  const summary = useMemo(() => {
    const bits: string[] = [];
    if (presetId === "custom") bits.push("custom");
    else if (presetId !== "none") {
      bits.push(
        RESIZE_PRESETS.find((p) => p.id === presetId)?.label.split(" ")[0] ??
          "",
      );
    }
    if (options.rotate) bits.push(`${options.rotate}°`);
    if (options.stripMetadata) bits.push("strip");
    if ((options.watermark?.text ?? "").trim().length > 0) bits.push("wm");
    return bits.filter(Boolean).join(" · ");
  }, [presetId, options.rotate, options.stripMetadata, options.watermark]);

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-surface/60 shadow-inset-hi">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="advanced-panel"
        className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors duration-base hover:bg-white/[0.02]"
      >
        <Settings2 size={14} strokeWidth={2} className="text-muted-strong" />
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          Opsi Lanjutan
        </span>
        {summary && (
          <span className="ml-2 hidden truncate font-mono text-[10.5px] uppercase tracking-wider text-muted-strong sm:inline">
            {summary}
          </span>
        )}
        <ChevronDown
          size={14}
          strokeWidth={2.2}
          className={[
            "ml-auto text-muted transition-transform duration-base ease-spring",
            open ? "rotate-180 text-foreground" : "",
          ].join(" ")}
        />
      </button>

      <div
        id="advanced-panel"
        className={[
          "grid transition-[grid-template-rows] duration-slow ease-out-quart",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="border-t border-white/[0.05]">
            {/* — Resize ——————————————————————————————————————————————— */}
            <Section icon={<Crop size={11} strokeWidth={2.2} />} title="Resize">
              <div>
                <select
                  id="resize-preset"
                  value={presetId === "custom" ? "custom" : presetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id === "custom") {
                      setOpt(
                        "resize",
                        options.resize ?? {
                          width: 1920,
                          height: 1920,
                          fit: "inside",
                        },
                      );
                      return;
                    }
                    const p = RESIZE_PRESETS.find((x) => x.id === id);
                    if (!p || p.id === "none") {
                      setOpt("resize", undefined);
                      return;
                    }
                    setOpt("resize", {
                      width: p.width,
                      height: p.height,
                      fit: p.fit,
                    });
                  }}
                  className="w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 text-[13px] text-foreground transition-colors duration-base focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                >
                  {RESIZE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  {presetId === "custom" && (
                    <option value="custom">Custom</option>
                  )}
                </select>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <NumberField
                    id="resize-width"
                    label="Lebar (px)"
                    value={options.resize?.width}
                    onChange={(v) => {
                      const cur = options.resize ?? {
                        fit: "inside" as ResizeFit,
                      };
                      if (v == null && cur.height == null) {
                        setOpt("resize", undefined);
                      } else {
                        setOpt("resize", { ...cur, width: v });
                      }
                    }}
                  />
                  <NumberField
                    id="resize-height"
                    label="Tinggi (px)"
                    value={options.resize?.height}
                    onChange={(v) => {
                      const cur = options.resize ?? {
                        fit: "inside" as ResizeFit,
                      };
                      if (v == null && cur.width == null) {
                        setOpt("resize", undefined);
                      } else {
                        setOpt("resize", { ...cur, height: v });
                      }
                    }}
                  />
                </div>
              </div>

              <div>
                <SubLabel>Mode</SubLabel>
                <div
                  role="radiogroup"
                  aria-label="Mode resize"
                  className="grid grid-cols-3 gap-1 rounded-md border border-white/[0.07] bg-base/40 p-1"
                >
                  {(
                    [
                      { id: "inside", label: "Fit dalam" },
                      { id: "cover", label: "Crop" },
                      { id: "contain", label: "Letterbox" },
                    ] as const
                  ).map((m) => {
                    const active = (options.resize?.fit ?? "inside") === m.id;
                    const disabled = !options.resize;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={disabled}
                        onClick={() => {
                          if (!options.resize) return;
                          setOpt("resize", { ...options.resize, fit: m.id });
                        }}
                        className={[
                          "rounded-[5px] px-2 py-1.5 text-[12px] font-medium tracking-tight transition-all duration-fast ease-out-quart",
                          disabled
                            ? "cursor-not-allowed text-muted/30"
                            : active
                              ? "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
                              : "text-muted-strong hover:bg-white/[0.04] hover:text-foreground",
                        ].join(" ")}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                <div
                  className={[
                    "grid transition-[grid-template-rows,opacity,margin] duration-slow ease-out-quart",
                    options.resize?.fit === "cover"
                      ? "mt-3 grid-rows-[1fr] opacity-100"
                      : "mt-0 grid-rows-[0fr] opacity-0",
                  ].join(" ")}
                  aria-hidden={options.resize?.fit !== "cover"}
                >
                  <div className="overflow-hidden">
                    <SubLabel>Crop dari</SubLabel>
                    <CropPositionGrid
                      value={options.resize?.position ?? "center"}
                      onChange={(p) => {
                        if (!options.resize) return;
                        setOpt("resize", { ...options.resize, position: p });
                      }}
                    />
                  </div>
                </div>
              </div>
            </Section>

            <Divider />

            {/* — Transform ——————————————————————————————————————————— */}
            <Section
              icon={<RotateCw size={11} strokeWidth={2.2} />}
              title="Transformasi"
            >
              <div>
                <SubLabel>Rotasi</SubLabel>
                <div
                  role="radiogroup"
                  aria-label="Rotasi gambar"
                  className="grid grid-cols-4 gap-1 rounded-md border border-white/[0.07] bg-base/40 p-1"
                >
                  {([0, 90, 180, 270] as const).map((deg) => {
                    const active = (options.rotate ?? 0) === deg;
                    return (
                      <button
                        key={deg}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setOpt("rotate", deg)}
                        className={[
                          "num rounded-[5px] px-2 py-1.5 font-mono text-[12px] tracking-tight transition-all duration-fast ease-out-quart",
                          active
                            ? "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
                            : "text-muted-strong hover:bg-white/[0.04] hover:text-foreground",
                        ].join(" ")}
                      >
                        {deg}°
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <SubLabel>Warna latar</SubLabel>
                <div className="flex items-center gap-2">
                  <ColorSwatch
                    id="bg-color"
                    color={
                      /^#[0-9a-fA-F]{6}$/.test(options.background)
                        ? options.background
                        : "#ffffff"
                    }
                    onChange={(c) => setOpt("background", c)}
                    label="Pilih warna latar"
                  />
                  <input
                    id="bg-hex"
                    type="text"
                    value={options.background}
                    onChange={(e) => setOpt("background", e.target.value)}
                    placeholder="#ffffff"
                    spellCheck={false}
                    className="num w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 font-mono text-[13px] tracking-tight text-foreground transition-colors duration-base placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] text-muted">
                  Untuk transparansi → JPEG atau letterbox.
                </p>
              </div>
            </Section>

            <Divider />

            {/* — Watermark ——————————————————————————————————————————— */}
            <Section
              icon={<Type size={11} strokeWidth={2.2} />}
              title="Watermark"
            >
              <WatermarkSection
                value={options.watermark ?? DEFAULT_WATERMARK}
                onChange={(wm) => setOpt("watermark", wm)}
              />
            </Section>

            <Divider />

            {/* — Metadata ———————————————————————————————————————————— */}
            <Section
              icon={<Layers size={11} strokeWidth={2.2} />}
              title="Metadata"
            >
              <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                <CheckOption
                  id="auto-orient"
                  label="Auto-rotate (EXIF)"
                  hint="Honor orientasi dari kamera/HP"
                  checked={options.autoOrient}
                  onChange={(v) => setOpt("autoOrient", v)}
                />
                <CheckOption
                  id="strip-metadata"
                  label="Hapus metadata"
                  hint="EXIF, GPS, IPTC — privasi"
                  checked={options.stripMetadata}
                  onChange={(v) => setOpt("stripMetadata", v)}
                />
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-5 sm:px-6">
      <div className="mb-3 flex items-center gap-1.5 text-muted-strong">
        <span className="text-muted-strong/80">{icon}</span>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-strong">
          {title}
        </h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Divider() {
  return <div aria-hidden className="h-px w-full bg-white/[0.04]" />;
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-wider text-muted">
      {children}
    </span>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-muted"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        placeholder="auto"
        value={value ?? ""}
        onChange={(e) => {
          const v =
            e.target.value === ""
              ? undefined
              : Math.max(0, Number(e.target.value));
          onChange(v);
        }}
        className="num w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 font-mono text-[13px] text-foreground transition-colors duration-base placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
      />
    </div>
  );
}

function ColorSwatch({
  id,
  color,
  onChange,
  label,
}: {
  id: string;
  color: string;
  onChange: (c: string) => void;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      className="group relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.02] transition-all duration-base hover:border-white/30 hover:shadow-[0_0_0_3px_rgb(255_255_255_/_0.06)]"
      style={{ background: color }}
      aria-label={label}
    >
      <input
        id={id}
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-12 cursor-pointer opacity-0"
        aria-label={label}
      />
    </label>
  );
}

function CheckOption({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={[
        "group flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-all duration-base ease-out-quart",
        checked
          ? "border-accent/40 bg-accent/[0.04]"
          : "border-white/[0.07] bg-base/40 hover:border-white/15 hover:bg-white/[0.03]",
      ].join(" ")}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={[
          "mt-[1px] grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border transition-all duration-fast ease-out-quart",
          checked
            ? "border-accent bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.5)]"
            : "border-white/15 bg-white/[0.02] text-transparent group-hover:border-white/30",
        ].join(" ")}
      >
        <Check size={11} strokeWidth={3.2} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[12.5px] font-medium tracking-tight text-foreground">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

/* ─── Crop position grid ──────────────────────────────────────────────── */

const CROP_GRID: ReadonlyArray<{ id: CropPosition; label: string }> = [
  { id: "top", label: "Atas-Kiri" },
  { id: "top", label: "Atas" },
  { id: "top", label: "Atas-Kanan" },
  { id: "left", label: "Kiri" },
  { id: "center", label: "Tengah" },
  { id: "right", label: "Kanan" },
  { id: "bottom", label: "Bawah-Kiri" },
  { id: "bottom", label: "Bawah" },
  { id: "bottom", label: "Bawah-Kanan" },
];

function CropPositionGrid({
  value,
  onChange,
}: {
  value: CropPosition;
  onChange: (p: CropPosition) => void;
}) {
  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Posisi crop"
        className="grid w-fit grid-cols-3 gap-1 rounded-md border border-white/[0.07] bg-base/40 p-1"
      >
        {CROP_GRID.map((c, i) => {
          const active = value === c.id;
          return (
            <button
              key={`${c.id}-${i}`}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={c.label}
              onClick={() => onChange(c.id)}
              className={[
                "relative grid h-7 w-7 place-items-center rounded-[5px] transition-all duration-fast ease-out-quart",
                active
                  ? "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
                  : "bg-white/[0.02] text-muted-strong hover:bg-white/[0.06] hover:text-foreground",
              ].join(" ")}
            >
              <span
                aria-hidden
                className={[
                  "h-1.5 w-1.5 rounded-full transition-colors duration-fast",
                  active ? "bg-base" : "bg-muted-strong/70",
                ].join(" ")}
              />
            </button>
          );
        })}
      </div>

      <div
        role="radiogroup"
        aria-label="Strategi crop pintar"
        className="flex flex-wrap gap-1.5"
      >
        {(
          [
            {
              id: "attention",
              label: "Pintar",
              hint: "deteksi otomatis",
              icon: <Sparkles size={11} strokeWidth={2.2} />,
            },
            {
              id: "entropy",
              label: "Entropi",
              hint: "area paling padat",
              icon: null,
            },
          ] as const
        ).map((s) => {
          const active = value === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(s.id)}
              title={s.hint}
              className={[
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium tracking-tight transition-all duration-fast ease-out-quart",
                active
                  ? "border-accent/40 bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
                  : "border-white/[0.07] bg-base/40 text-muted-strong hover:border-white/15 hover:text-foreground",
              ].join(" ")}
            >
              {s.icon}
              <span>{s.label}</span>
              <span
                className={[
                  "font-mono text-[9.5px] uppercase tracking-wider",
                  active ? "text-base/70" : "text-muted",
                ].join(" ")}
              >
                {s.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Watermark section ───────────────────────────────────────────────── */

const WM_GRID: ReadonlyArray<{ id: WatermarkPosition; label: string }> = [
  { id: "tl", label: "Atas-Kiri" },
  { id: "tc", label: "Atas" },
  { id: "tr", label: "Atas-Kanan" },
  { id: "ml", label: "Kiri" },
  { id: "mc", label: "Tengah" },
  { id: "mr", label: "Kanan" },
  { id: "bl", label: "Bawah-Kiri" },
  { id: "bc", label: "Bawah" },
  { id: "br", label: "Bawah-Kanan" },
];

interface WatermarkValue {
  text: string;
  position: WatermarkPosition;
  opacity: number;
  fontSize: number;
  color: string;
}

function WatermarkSection({
  value,
  onChange,
}: {
  value: WatermarkValue;
  onChange: (wm: WatermarkValue) => void;
}) {
  const active = value.text.trim().length > 0;
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(value.color)
    ? value.color
    : "#ffffff";

  return (
    <div className="sm:col-span-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={[
            "grid h-9 w-9 shrink-0 place-items-center rounded-md border transition-colors duration-base",
            active
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-white/[0.07] bg-base/40 text-muted",
          ].join(" ")}
        >
          <Type size={14} strokeWidth={2} />
        </span>
        <input
          id="wm-text"
          type="text"
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          placeholder="© Your Brand 2026"
          aria-label="Teks watermark"
          spellCheck={false}
          maxLength={200}
          className="w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 text-[13px] tracking-tight text-foreground transition-colors duration-base placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
        <span
          className={[
            "shrink-0 font-mono text-[10px] uppercase tracking-wider transition-opacity duration-base",
            active ? "text-muted-strong opacity-100" : "text-muted/40 opacity-0",
          ].join(" ")}
        >
          {value.position}
        </span>
      </div>

      {!active && (
        <p className="mt-1.5 text-[11.5px] text-muted">
          Kosongkan untuk tanpa watermark.
        </p>
      )}

      <div
        className={[
          "grid transition-[grid-template-rows,opacity,margin] duration-slow ease-out-quart",
          active
            ? "mt-4 grid-rows-[1fr] opacity-100"
            : "mt-0 grid-rows-[0fr] opacity-0",
        ].join(" ")}
        aria-hidden={!active}
      >
        <div className="overflow-hidden">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div>
              <SubLabel>Posisi</SubLabel>
              <div
                role="radiogroup"
                aria-label="Posisi watermark"
                className="grid w-fit grid-cols-3 gap-1 rounded-md border border-white/[0.07] bg-base/40 p-1"
              >
                {WM_GRID.map((g) => {
                  const isActive = value.position === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      aria-label={g.label}
                      onClick={() => onChange({ ...value, position: g.id })}
                      className={[
                        "relative grid h-7 w-7 place-items-center rounded-[5px] transition-all duration-fast ease-out-quart",
                        isActive
                          ? "bg-accent text-base shadow-[inset_0_1px_0_rgb(255_255_255_/_0.4)]"
                          : "bg-white/[0.02] text-muted-strong hover:bg-white/[0.06] hover:text-foreground",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden
                        className={[
                          "h-1.5 w-1.5 rounded-full transition-colors duration-fast",
                          isActive ? "bg-base" : "bg-muted-strong/70",
                        ].join(" ")}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <RangeRow
                id="wm-opacity"
                label="Opasitas"
                value={value.opacity}
                min={0}
                max={100}
                step={1}
                fill={`${value.opacity}%`}
                display={`${value.opacity}%`}
                onChange={(v) => onChange({ ...value, opacity: v })}
              />
              <RangeRow
                id="wm-fontsize"
                label="Ukuran teks"
                hint="(% sisi terpendek)"
                value={value.fontSize}
                min={0.5}
                max={20}
                step={0.5}
                fill={`${((value.fontSize - 0.5) / 19.5) * 100}%`}
                display={value.fontSize.toFixed(1)}
                onChange={(v) => onChange({ ...value, fontSize: v })}
              />
              <div>
                <SubLabel>Warna teks</SubLabel>
                <div className="flex items-center gap-2">
                  <ColorSwatch
                    id="wm-color"
                    color={safeColor}
                    onChange={(c) => onChange({ ...value, color: c })}
                    label="Pilih warna watermark"
                  />
                  <input
                    type="text"
                    value={value.color}
                    onChange={(e) =>
                      onChange({ ...value, color: e.target.value })
                    }
                    placeholder="#ffffff"
                    spellCheck={false}
                    aria-label="Hex warna watermark"
                    className="num w-full rounded-md border border-white/[0.07] bg-base/40 px-3 py-2 font-mono text-[13px] tracking-tight text-foreground transition-colors duration-base placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RangeRow({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  fill,
  display,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fill: string;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="font-mono text-[10.5px] uppercase tracking-wider text-muted"
        >
          {label}{" "}
          {hint && (
            <span className="text-muted-strong/70 normal-case tracking-normal">
              {hint}
            </span>
          )}
        </label>
        <span className="num font-mono text-[12px] text-muted-strong">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-accent"
        style={{ "--fill": fill } as React.CSSProperties}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
    </div>
  );
}
