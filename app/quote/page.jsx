'use client';

import { useState, useCallback, useEffect } from "react";
import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import { calcUnitCost } from "@/lib/pricing";

// ─── Config ────────────────────────────────────────────────────────────────
const SHIRT_QUALITIES = [
  { label: "Standard", itemNumber: "5000", description: "Gildan Heavy Cotton" },
  { label: "Premium", itemNumber: "6210", description: "Next Level CVC Crew" },
];

const GARMENT_TYPES = ["T-Shirt", "Hoodie", "Sweatshirt", "Long Sleeve", "Headwear"];

const DECORATION_METHODS = [
  { value: "Screen Printing", label: "Screen Printing", icon: "🖨️" },
  { value: "Embroidery", label: "Embroidery", icon: "🧵" },
  { value: "DTF", label: "DTF Transfer", icon: "🎨" },
  { value: "Not Sure", label: "Not Sure", icon: "🤷" },
];

const PRINT_LOCATIONS = [
  "Front Chest", "Back Full", "Left Chest", "Right Chest",
  "Sleeve Left", "Sleeve Right", "Nape", "Custom",
];

const STEPS = [
  { num: 1, label: "Your Info" },
  { num: 2, label: "Garment" },
  { num: 3, label: "Decoration" },
  { num: 4, label: "Review" },
];

// ─── Sub-components ────────────────────────────────────────────────────────

function StepHeader({ num, label, active, completed }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: "1.5rem",
    }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: completed ? "var(--accent)" : active ? "var(--accent)" : "var(--border)",
        color: completed || active ? "#fff" : "var(--muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {completed ? "✓" : num}
      </div>
      <h2 style={{
        fontSize: 22,
        fontWeight: 700,
        color: active ? "var(--foreground)" : "var(--muted)",
        margin: 0,
        letterSpacing: "-0.01em",
      }}>
        {label}
      </h2>
    </div>
  );
}

function SelectCard({ selected, onClick, children, style = {} }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10,
        padding: "1rem",
        background: selected ? "rgba(0,255,102,0.08)" : "var(--surface)",
        cursor: "pointer",
        textAlign: "center",
        transition: "all 0.15s",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function GarmentChip({ label, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        cursor: "pointer",
        background: selected ? "var(--accent)" : "var(--surface)",
        color: selected ? "#ffffff" : "var(--muted)",
        transition: "all 0.15s",
        userSelect: "none",
        fontFamily: "inherit",
      }}
    >
      <span style={{
        width: 14, height: 14,
        border: `1px solid ${selected ? "#ffffff" : "var(--muted)"}`,
        borderRadius: 3,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, flexShrink: 0,
        color: selected ? "#ffffff" : "var(--muted)",
      }}>
        {selected ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function QuoteForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedGarments, setSelectedGarments] = useState([]);
  const [locsEnabled, setLocsEnabled] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [garmentPricing, setGarmentPricing] = useState({});
  const [sizeBreakdown, setSizeBreakdown] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      fname: "", lname: "", email: "", phone: "", company: "", dueDate: "",
      qty: "", decorationMethod: "Screen Printing", inkColors: 1,
      shirtQuality: "5000", shirtColor: "", jobName: "", notes: "",
      mailingList: true,
      locations: [{ name: "Front Chest", colors: 1, art: "" }],
    },
  });

  const { fields: locationFields, append: appendLocation, remove: removeLocation } = useFieldArray({ control, name: "locations" });

  // Load S&S garment pricing on mount
  useEffect(() => {
    fetch("/api/garment-pricing?styles=5000,6210")
      .then((r) => r.json())
      .then((data) => setGarmentPricing(data))
      .catch(() => {});
  }, []);

  // Live estimate
  const watchedQty = useWatch({ control, name: "qty" });
  const watchedInkColors = useWatch({ control, name: "inkColors" });
  const watchedShirtQuality = useWatch({ control, name: "shirtQuality" });
  const watchedLocations = useWatch({ control, name: "locations" });
  const watchedSizes = useWatch({ control, name: undefined });

  const liveEstimate = (() => {
    const qty = parseInt(watchedQty) || 0;
    if (qty < 1) return null;
    const styleData = garmentPricing[watchedShirtQuality];
    const wholesaleGarmentCost = styleData?.customerPrice ?? null;
    // Apply 115% markup to the wholesale garment cost (same as Printavo)
    const garmentCost = wholesaleGarmentCost != null ? wholesaleGarmentCost * 1.15 : null;
    const decorationCost = calcUnitCost(qty, watchedInkColors, locsEnabled, watchedLocations);
    if (garmentCost == null && decorationCost == null) return null;
    const unitPrice = (garmentCost ?? 0) + (decorationCost ?? 0);
    const subtotal = unitPrice * qty;
    const salesTax = subtotal * 0.075;
    return {
      qty, garmentCost, decorationCost, unitPrice,
      subtotal, salesTax, totalPrice: subtotal + salesTax,
      hasGarmentCost: garmentCost != null,
    };
  })();

  // File upload
  const handleFiles = useCallback(async (files) => {
    const incoming = Array.from(files).filter((f) => !uploadedFiles.find((u) => u.name === f.name));
    if (!incoming.length) return;
    const placeholders = incoming.map((f) => ({ name: f.name, url: null, uploading: true, error: null }));
    setUploadedFiles((prev) => [...prev, ...placeholders]);
    for (const file of incoming) {
      try {
        const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
        const blob = await res.json();
        setUploadedFiles((prev) => prev.map((f) => f.name === file.name ? { name: file.name, url: blob.url, uploading: false, error: null } : f));
      } catch {
        setUploadedFiles((prev) => prev.map((f) => f.name === file.name ? { ...f, uploading: false, error: "Upload failed" } : f));
      }
    }
  }, [uploadedFiles]);

  const removeFile = (i) => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i));

  // Step navigation
  const goNext = async () => {
    let fieldsToValidate = [];
    if (currentStep === 1) fieldsToValidate = ["fname", "email"];
    if (currentStep === 2) fieldsToValidate = ["qty", "shirtQuality"];
    if (currentStep === 3) fieldsToValidate = ["decorationMethod"];
    const valid = fieldsToValidate.length === 0 || await trigger(fieldsToValidate);
    if (currentStep === 2 && selectedGarments.length === 0) {
      setSubmitError("Please select at least one garment type.");
      return;
    }
    setSubmitError("");
    if (valid) setCurrentStep((s) => Math.min(s + 1, STEPS.length));
  };

  const goBack = () => {
    setSubmitError("");
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  const onSubmit = async (data) => {
    setSubmitError("");
    setSubmitSuccess("");
    if (selectedGarments.length === 0) { setSubmitError("Please select at least one garment type."); return; }
    if (uploadedFiles.some((f) => f.uploading)) { setSubmitError("Please wait for files to finish uploading."); return; }

    const artworkUrls = uploadedFiles.filter((f) => f.url).map((f) => ({ name: f.name, url: f.url }));
    const resolvedJobName = data.jobName.trim() || `${selectedGarments.join(" + ")} — ${data.fname}`;

    try {
      const res = await fetch("/api/submit-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fname: data.fname, lname: data.lname, email: data.email,
          phone: data.phone, company: data.company, dueDate: data.dueDate,
          notes: data.notes, jobName: resolvedJobName,
          decorationMethod: data.decorationMethod, inkColors: data.inkColors,
          qty: data.qty, shirtQuality: data.shirtQuality || "5000",
          shirtColor: data.shirtColor || null,
          garmentTypes: selectedGarments,
          locations: locsEnabled ? data.locations : [],
          locsEnabled, artworkUrls,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setSubmitError(json.error || "Something went wrong."); return; }
      setSubmitSuccess("Quote submitted! We'll be in touch soon.");
    } catch {
      setSubmitError("Network error — please try again.");
    }
  };

  // ── Shared styles ──
  const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", marginBottom: "1rem" };
  const sectionLabel = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", margin: "0 0 0.75rem" };
  const fieldLabel = { display: "block", fontSize: 12, fontWeight: 500, color: "var(--muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" };
  const inputBase = { width: "100%", height: 42, padding: "10px 12px", fontSize: 14, background: "#F8F7F5", border: "1px solid var(--border)", borderRadius: 8, outline: "none", boxSizing: "border-box", color: "#1E0033", fontFamily: "inherit", transition: "border-color 0.15s", colorScheme: "light", appearance: "none", WebkitAppearance: "none" };
  const inputErr = { ...inputBase, border: "1px solid #ff4444" };
  const twoCol = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginBottom: 14 };
  const errMsg = { fontSize: 11, color: "#ff4444", marginTop: 4 };
  const btnPrimary = { width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 600, background: "var(--accent)", border: "none", borderRadius: 50, cursor: "pointer", color: "#ffffff", fontFamily: "inherit", letterSpacing: "0.02em", transition: "opacity 0.15s" };
  const btnSecondary = { padding: "11px 24px", fontSize: 14, fontWeight: 500, background: "transparent", border: "1px solid var(--border)", borderRadius: 50, cursor: "pointer", color: "var(--muted)", fontFamily: "inherit" };

  const isStepCompleted = (n) => n < currentStep;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1rem", fontFamily: "inherit" }}>

      {/* Page heading */}
      <div style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, color: "var(--foreground)", margin: "0 0 0.5rem" }}>
          Get a <span style={{ color: "#00FF66" }}>Free Quote</span>
        </h1>
        <p style={{ fontSize: 15, color: "var(--muted)", margin: 0 }}>
          Fill out the form below and we'll get back to you fast.
        </p>
      </div>

      {/* Step progress bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: "2rem" }}>
        {STEPS.map((step, i) => (
          <div key={step.num} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: isStepCompleted(step.num) ? "var(--accent)" : currentStep === step.num ? "var(--accent)" : "var(--border)",
                color: isStepCompleted(step.num) || currentStep === step.num ? "#fff" : "var(--muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, flexShrink: 0,
                transition: "all 0.2s",
              }}>
                {isStepCompleted(step.num) ? "✓" : step.num}
              </div>
              <span style={{ fontSize: 10, color: currentStep === step.num ? "var(--accent)" : "var(--muted)", fontWeight: currentStep === step.num ? 600 : 400, whiteSpace: "nowrap" }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 40, height: 2, background: isStepCompleted(step.num) ? "var(--accent)" : "var(--border)", margin: "0 4px", marginBottom: 18, transition: "background 0.2s" }} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>

        {/* ══════════════════════════════════════════════════════════════════
            STEP 1 — YOUR INFO
        ══════════════════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <div style={card}>
            <StepHeader num={1} label="Your Info" active completed={false} />
            <div style={twoCol}>
              <div>
                <label style={fieldLabel}>First name *</label>
                <input style={errors.fname ? inputErr : inputBase} placeholder="Alex" {...register("fname", { required: "First name is required" })} />
                {errors.fname && <p style={errMsg}>{errors.fname.message}</p>}
              </div>
              <div>
                <label style={fieldLabel}>Last name</label>
                <input style={inputBase} placeholder="Johnson" {...register("lname")} />
              </div>
            </div>
            <div style={twoCol}>
              <div>
                <label style={fieldLabel}>Email *</label>
                <input type="email" style={errors.email ? inputErr : inputBase} placeholder="alex@company.com"
                  {...register("email", { required: "Email is required", pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" } })} />
                {errors.email && <p style={errMsg}>{errors.email.message}</p>}
              </div>
              <div>
                <label style={fieldLabel}>Phone</label>
                <input type="tel" style={inputBase} placeholder="704-555-0100" {...register("phone")} />
              </div>
            </div>
            <div style={twoCol}>
              <div>
                <label style={fieldLabel}>Company / org</label>
                <input style={inputBase} placeholder="Company or team name" {...register("company")} />
              </div>
              <div>
                <label style={fieldLabel}>In-hands date</label>
                <input type="date" style={{ ...inputBase, colorScheme: "light" }} {...register("dueDate")} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Job name</label>
              <input style={inputBase} placeholder="Spring 2026 order" {...register("jobName")} />
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" style={btnPrimary} onClick={goNext}>Continue →</button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            STEP 2 — GARMENT
        ══════════════════════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <div style={card}>
            <StepHeader num={2} label="Garment" active completed={false} />

            {/* Garment type */}
            <p style={sectionLabel}>What are you decorating? *</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
              {GARMENT_TYPES.map((g) => (
                <GarmentChip key={g} label={g} selected={selectedGarments.includes(g)} onToggle={() => {
                  setSelectedGarments((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
                  setSubmitError("");
                }} />
              ))}
            </div>
            {submitError && submitError.includes("garment") && <p style={{ ...errMsg, marginBottom: 12 }}>{submitError}</p>}

            {/* Shirt quality */}
            <p style={{ ...sectionLabel, marginBottom: 10 }}>Shirt quality</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {SHIRT_QUALITIES.map((q) => {
                const pricing = garmentPricing[q.itemNumber];
                return (
                  <Controller key={q.itemNumber} name="shirtQuality" control={control} render={({ field }) => (
                    <SelectCard selected={field.value === q.itemNumber} onClick={() => field.onChange(q.itemNumber)}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", marginBottom: 2 }}>{q.label}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{q.description}</div>
                      {pricing?.customerPrice && (
                        <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                          From ${pricing.customerPrice.toFixed(2)}/ea{pricing.isMock ? " *" : ""}
                        </div>
                      )}
                    </SelectCard>
                  )} />
                );
              })}
            </div>

            {/* Color */}
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Shirt color</label>
              <input style={inputBase} placeholder="e.g. Black, White, Navy" {...register("shirtColor")} />
            </div>

            {/* Quantity row */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                <label style={{ ...fieldLabel, margin: 0 }}>Quantity *</label>
                <button
                  type="button"
                  onClick={() => setSizeBreakdown((v) => !v)}
                  style={{
                    fontSize: 11, color: sizeBreakdown ? "var(--accent)" : "var(--muted)",
                    background: "none", border: `1px solid ${sizeBreakdown ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 20, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.15s", whiteSpace: "nowrap",
                  }}
                >
                  Know exact sizes?
                </button>
              </div>
              {!sizeBreakdown && (
                <>
                  <input type="number" min="1" style={errors.qty ? inputErr : inputBase} placeholder="e.g. 48"
                    {...register("qty", { required: "Quantity is required", min: { value: 1, message: "Must be at least 1" } })} />
                  {errors.qty && <p style={errMsg}>{errors.qty.message}</p>}
                </>
              )}
            </div>

            {/* Size breakdown grid */}
            {sizeBreakdown && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ ...sectionLabel, marginBottom: 8 }}>Sizes</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                  {["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"].map((size) => {
                    const key = `size_${size.replace(/\s/g, "")}`;
                    return (
                      <div key={size} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>{size}</div>
                        <input
                          type="number" min="0" placeholder="0"
                          style={{ ...inputBase, textAlign: "center", padding: "8px 4px", height: 38 }}
                          {...register(key, { min: 0, valueAsNumber: true })}
                        />
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, opacity: 0.7 }}>
                  Total: {["XS","S","M","L","XL","2XL","3XL","4XL","5XL"].reduce((sum, s) => {
                    const v = parseInt(watchedSizes?.[`size_${s.replace(/\s/g,"")}`]) || 0;
                    return sum + v;
                  }, 0)} pcs
                </p>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" style={btnSecondary} onClick={goBack}>← Back</button>
              <button type="button" style={{ ...btnPrimary, flex: 1 }} onClick={goNext}>Continue →</button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            STEP 3 — DECORATION & ARTWORK (combined)
        ══════════════════════════════════════════════════════════════════ */}
        {currentStep === 3 && (
          <div style={card}>
            <StepHeader num={3} label="Decoration & Artwork" active completed={false} />

            {/* Decoration method */}
            <p style={sectionLabel}>Decoration method *</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }}>
              {DECORATION_METHODS.map((m) => (
                <Controller key={m.value} name="decorationMethod" control={control} render={({ field }) => (
                  <SelectCard selected={field.value === m.value} onClick={() => field.onChange(m.value)}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{m.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{m.label}</div>
                  </SelectCard>
                )} />
              ))}
            </div>

            {/* Artwork — each file gets a location + color count */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginBottom: 16 }}>
              <p style={sectionLabel}>Artwork files</p>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.6 }}>
                Upload each artwork file and assign its print location and color count. Don't have art yet? Skip and we'll follow up.
              </p>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => document.getElementById("qf-file-input").click()}
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 10, padding: "1.5rem 1rem", textAlign: "center",
                  cursor: "pointer", background: dragOver ? "rgba(0,255,102,0.04)" : "transparent",
                  marginBottom: 12, transition: "all 0.15s",
                }}
              >
                <input id="qf-file-input" type="file" accept="image/*,.pdf,.ai,.eps,.svg" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
                <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                <span style={{ display: "block", fontSize: 13, color: "var(--foreground)", marginBottom: 3, fontWeight: 500 }}>
                  Drag & drop or click to upload
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)", opacity: 0.7 }}>PNG, JPG, PDF, AI, EPS, SVG</span>
              </div>

              {/* Per-file location + color assignment */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {uploadedFiles.map((file, i) => (
                  <div key={i} style={{
                    background: "var(--background)",
                    border: `1px solid ${file.error ? "#ff4444" : file.uploading ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 10, padding: "0.9rem 1rem",
                  }}>
                    {/* File name + status row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                        <span style={{ fontSize: 16 }}>{file.uploading ? "⏳" : file.error ? "❌" : "✅"}</span>
                        <span style={{ fontSize: 13, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{file.name}</span>
                        {file.uploading && <span style={{ fontSize: 11, color: "var(--accent)", flexShrink: 0 }}>Uploading…</span>}
                        {file.error && <span style={{ fontSize: 11, color: "#ff4444", flexShrink: 0 }}>{file.error}</span>}
                      </div>
                      <button type="button" onClick={() => removeFile(i)} style={{ fontSize: 12, color: "#ff4444", background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, fontFamily: "inherit", marginLeft: 8 }}>Remove</button>
                    </div>
                    {/* Location + colors for this artwork */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={fieldLabel}>Print location</label>
                        <select
                          style={inputBase}
                          value={file.location || ""}
                          onChange={(e) => setUploadedFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, location: e.target.value } : f))}
                        >
                          <option value="">Select location…</option>
                          {PRINT_LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={fieldLabel}>Ink colors</label>
                        <select
                          style={inputBase}
                          value={file.colors || 1}
                          onChange={(e) => setUploadedFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, colors: parseInt(e.target.value) } : f))}
                        >
                          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} color{n > 1 ? "s" : ""}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" style={btnSecondary} onClick={goBack}>← Back</button>
              <button type="button" style={{ ...btnPrimary, flex: 1 }} onClick={goNext}>Continue →</button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            STEP 4 — REVIEW & SUBMIT
        ══════════════════════════════════════════════════════════════════ */}
        {currentStep === 4 && (
          <div style={card}>
            <StepHeader num={4} label="Review & Submit" active completed={false} />

            {/* Summary */}
            <div style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: 16 }}>
              <p style={{ ...sectionLabel, marginBottom: 10 }}>Order summary</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--muted)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Garments</span>
                  <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{selectedGarments.join(", ") || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Style</span>
                  <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
                    {SHIRT_QUALITIES.find((q) => q.itemNumber === watchedShirtQuality)?.label || "—"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Quantity</span>
                  <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{watchedQty || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Decoration</span>
                  <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{watchedInkColors} color{watchedInkColors > 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Artwork files</span>
                  <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{uploadedFiles.filter((f) => f.url).length} uploaded</span>
                </div>
              </div>
            </div>

            {/* Price estimate */}
            {liveEstimate && (
              <div style={{ background: "var(--background)", border: "1px solid var(--accent)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: 16 }}>
                <p style={{ ...sectionLabel, margin: "0 0 0.6rem", color: "var(--accent)" }}>Estimated price</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {liveEstimate.hasGarmentCost && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
                      <span>Garment ({liveEstimate.qty} × ${liveEstimate.garmentCost.toFixed(2)})</span>
                      <span>${(liveEstimate.garmentCost * liveEstimate.qty).toFixed(2)}</span>
                    </div>
                  )}
                  {liveEstimate.decorationCost != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
                      <span>Decoration ({liveEstimate.qty} × ${liveEstimate.decorationCost.toFixed(2)})</span>
                      <span>${(liveEstimate.decorationCost * liveEstimate.qty).toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 5, marginTop: 2 }}>
                    <span>Subtotal</span><span>${liveEstimate.subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
                    <span>Est. Sales tax (7.5%)</span><span>${liveEstimate.salesTax.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "var(--foreground)", borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: 2 }}>
                    <span>Estimated total</span>
                    <span style={{ color: "var(--accent)" }}>${liveEstimate.totalPrice.toFixed(2)}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0", opacity: 0.7 }}>Estimate only — final price confirmed after review.</p>
                </div>
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={fieldLabel}>Notes / special requests <span style={{ fontWeight: 400, textTransform: "none", opacity: 0.6 }}>— optional</span></label>
              <textarea style={{ ...inputBase, minHeight: 80, resize: "vertical" }} placeholder="Art details, colors, rush timeline, anything else helpful..." {...register("notes")} />
            </div>

            {/* Mailing list */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "0.75rem 0", borderTop: "1px solid var(--border)", marginBottom: 16 }}>
              <input type="checkbox" id="mailing-list" style={{ width: 16, height: 16, margin: "2px 0 0", flexShrink: 0, cursor: "pointer", accentColor: "var(--accent)" }} {...register("mailingList")} />
              <label htmlFor="mailing-list" style={{ fontSize: 13, color: "var(--foreground)", cursor: "pointer", lineHeight: 1.5 }}>
                Add me to the mailing list
                <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  Get exclusive coupons, promos, and updates from Thread Giant.
                </span>
              </label>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" style={btnSecondary} onClick={goBack}>← Back</button>
              <button type="submit" disabled={isSubmitting} style={{ ...btnPrimary, flex: 1, opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}>
                {isSubmitting ? "Sending..." : "Submit Quote Request 🚀"}
              </button>
            </div>

            {submitError && (
              <div style={{ background: "var(--surface)", border: "1px solid #ff4444", borderRadius: 8, padding: "0.75rem 1rem", fontSize: 13, color: "#ff4444", marginTop: "1rem" }}>
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div style={{ background: "var(--surface)", border: "1px solid #00FF66", borderRadius: 8, padding: "0.75rem 1rem", fontSize: 13, color: "#00FF66", marginTop: "1rem", lineHeight: 1.6 }}>
                {submitSuccess}
              </div>
            )}
          </div>
        )}

      </form>
    </div>
  );
}
