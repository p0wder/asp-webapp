'use client';

import { useState, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@clerk/nextjs";
import { calcUnitCost } from "@/lib/pricing";

// ─── Config ──────────────────────────────────────────────────────────────────

const GARMENT_TYPES = [
  { value: "T-Shirt",    icon: "👕" },
  { value: "Hoodie",     icon: "🧥" },
  { value: "Sweatshirt", icon: "🩱" },
  { value: "Long Sleeve",icon: "👔" },
  { value: "Headwear",   icon: "🧢" },
];

const APPAREL_QUALITIES = [
  { label: "Standard", itemNumber: "5000", description: "Gildan Heavy Cotton" },
  { label: "Premium", itemNumber: "6210", description: "Next Level CVC Crew" },
];

const HEADWEAR_QUALITIES = [
  { label: "Standard", itemNumber: "112FP", description: "Richardson Trucker Cap" },
  { label: "Premium", itemNumber: "6277", description: "Flexfit Cotton Blend" },
];

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
  { num: 2, label: "Your Order" },
  { num: 3, label: "Artwork" },
  { num: 4, label: "Review" },
];

const DEFAULT_BUILDER = {
  garmentType: "T-Shirt",
  decorationMethod: "Screen Printing",
  inkColors: 1,
  qty: "",
  shirtQuality: "5000",
  shirtColor: "",
};

function getQualities(garmentType) {
  return garmentType === "Headwear" ? HEADWEAR_QUALITIES : APPAREL_QUALITIES;
}

function itemShowsColors(item) {
  return ["Screen Printing", "DTF", "Embroidery"].includes(item.decorationMethod);
}

function inkColorLabel(decorationMethod) {
  return decorationMethod === "Embroidery" ? "Thread colors" : "Ink colors";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepHeader({ num, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--accent)", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 700, flexShrink: 0,
      }}>{num}</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--foreground)", margin: 0, letterSpacing: "-0.01em" }}>
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
        borderRadius: 10, padding: "1rem",
        background: selected ? "rgba(0,255,102,0.08)" : "var(--surface)",
        cursor: "pointer", textAlign: "center",
        transition: "all 0.15s", fontFamily: "inherit",
        ...style,
      }}
    >{children}</button>
  );
}

function GarmentChip({ label, icon, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10, padding: "10px 16px",
        cursor: "pointer",
        background: selected ? "rgba(0,255,102,0.08)" : "var(--surface)",
        color: selected ? "var(--foreground)" : "var(--muted)",
        fontWeight: selected ? 600 : 400,
        transition: "all 0.15s", userSelect: "none", fontFamily: "inherit",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        minWidth: 72,
      }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{label}</span>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuoteForm() {
  const { isSignedIn } = useAuth();
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  // Multi-garment items
  const [quoteItems, setQuoteItems] = useState([]);
  const [builder, setBuilder] = useState(DEFAULT_BUILDER);
  const [builderError, setBuilderError] = useState("");

  // Artwork
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  // Submission
  const [submitError, setSubmitError] = useState("");
  const [quoteData, setQuoteData] = useState(null);

  // Pricing
  const [garmentPricing, setGarmentPricing] = useState({});
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState(null);
  const [promoChecking, setPromoChecking] = useState(false);

  const { register, handleSubmit, trigger, formState: { errors, isSubmitting }, watch } = useForm({
    defaultValues: {
      fname: "", lname: "", email: "", phone: "", company: "",
      dueDate: "", jobName: "", notes: "", mailingList: true,
    },
  });

  const watchedEmail = watch("email");

  // Load garment pricing — apparel + headwear styles
  useEffect(() => {
    fetch("/api/garment-pricing?styles=5000,6210,112FP,6277")
      .then((r) => r.json())
      .then((data) => setGarmentPricing(data))
      .catch(() => {});
  }, []);

  // Pre-fill promo from ?promo= URL param
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const p = params.get("promo");
    if (p) setPromoCode(p.toUpperCase());
  }, []);

  // ── Per-item live estimate ────────────────────────────────────────────────
  function computeItemEstimate(item) {
    const qty = parseInt(item.qty) || 0;
    if (qty < 1) return null;
    const styleData = garmentPricing[item.shirtQuality];
    const wholesaleGarmentCost = styleData?.customerPrice ?? null;
    const garmentCost = wholesaleGarmentCost != null ? wholesaleGarmentCost * 1.15 : null;
    // Only screen printing + DTF use the decoration matrix
    const canEstimate = item.decorationMethod === "Screen Printing" || item.decorationMethod === "DTF";
    const decorationCost = canEstimate ? (calcUnitCost(qty, item.inkColors, false, []) ?? null) : null;
    if (garmentCost == null && decorationCost == null) return null;
    const unitPrice = (garmentCost ?? 0) + (decorationCost ?? 0);
    const subtotal = unitPrice * qty;
    return { qty, garmentCost, decorationCost, unitPrice, subtotal, hasGarmentCost: garmentCost != null };
  }


  // ── Grand total across all added items ────────────────────────────────────
  const totalEstimate = (() => {
    if (quoteItems.length === 0) return null;
    let subtotal = 0;
    let hasAny = false;
    let partial = false;
    for (const item of quoteItems) {
      const est = computeItemEstimate(item);
      if (est) { subtotal += est.subtotal; hasAny = true; }
      else partial = true;
    }
    if (!hasAny) return null;
    const promoDiscount = (promoStatus?.valid && promoStatus?.discountAmount) ? promoStatus.discountAmount : 0;
    const discountedSubtotal = Math.max(0, subtotal - promoDiscount);
    const salesTax = discountedSubtotal * 0.075;
    return { subtotal, promoDiscount, discountedSubtotal, salesTax, totalPrice: discountedSubtotal + salesTax, partial };
  })();

  // ── Promo validation (debounced) ──────────────────────────────────────────
  useEffect(() => {
    if (!promoCode.trim()) { setPromoStatus(null); return; }
    const subtotal = totalEstimate?.subtotal ?? 0;
    setPromoChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/validate-promo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: promoCode.trim(), subtotal, email: watchedEmail || null }),
        });
        const data = await res.json();
        setPromoStatus(data);
      } catch {
        setPromoStatus({ valid: false, message: "Could not validate code" });
      } finally {
        setPromoChecking(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [promoCode, totalEstimate?.subtotal, watchedEmail]);

  // ── File upload ───────────────────────────────────────────────────────────
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

  // ── Builder helpers ───────────────────────────────────────────────────────
  const updateBuilder = (field, value) => setBuilder((prev) => ({ ...prev, [field]: value }));

  const handleBuilderGarmentType = (garmentType) => {
    const qualities = getQualities(garmentType);
    setBuilder((prev) => ({ ...prev, garmentType, shirtQuality: qualities[0].itemNumber }));
  };

  const addItemToQuote = () => {
    const qty = parseInt(builder.qty);
    if (!qty || qty < 1) { setBuilderError("Please enter a valid quantity."); return; }
    setBuilderError("");
    setQuoteItems((prev) => [...prev, { ...builder, qty, id: String(Date.now()) }]);
    setBuilder(DEFAULT_BUILDER);
  };

  const removeItem = (id) => setQuoteItems((prev) => prev.filter((item) => item.id !== id));

  // ── Step navigation ───────────────────────────────────────────────────────
  const goNext = async () => {
    if (currentStep === 1) {
      const valid = await trigger(["fname", "email"]);
      if (!valid) return;
    }
    if (currentStep === 2 && quoteItems.length === 0) {
      setSubmitError("Please add at least one garment to your quote.");
      return;
    }
    setSubmitError("");
    setCurrentStep((s) => Math.min(s + 1, STEPS.length));
  };

  const goBack = () => {
    setSubmitError("");
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  // ── Form submission ───────────────────────────────────────────────────────
  const onSubmit = async (data) => {
    setSubmitError("");
    if (quoteItems.length === 0) { setSubmitError("Please add at least one garment to your quote."); return; }
    if (uploadedFiles.some((f) => f.uploading)) { setSubmitError("Please wait for files to finish uploading."); return; }

    const artworkUrls = uploadedFiles.filter((f) => f.url).map((f) => ({ name: f.name, url: f.url }));
    const resolvedJobName = data.jobName.trim() || `${quoteItems.map((i) => i.garmentType).join(" + ")} — ${data.fname}`;

    try {
      const res = await fetch("/api/submit-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fname: data.fname, lname: data.lname, email: data.email,
          phone: data.phone, company: data.company, dueDate: data.dueDate,
          notes: data.notes, jobName: resolvedJobName,
          quoteItems,
          artworkUrls,
          promoCode: promoStatus?.valid && promoCode.trim() ? promoCode.trim() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setSubmitError(json.error || "Something went wrong."); return; }
      setQuoteData({
        quoteId: json.quoteId || null,
        quoteUrl: json.quoteUrl || null,
        statusUrl: json.statusUrl || null,
        email: data.email,
        summary: {
          quoteItems,
          artworkCount: uploadedFiles.filter((f) => f.url).length,
          totalEstimate,
          appliedPromo: promoStatus?.valid
            ? { code: promoCode.trim(), message: promoStatus.message, discountAmount: promoStatus.discountAmount }
            : null,
        },
      });
    } catch {
      setSubmitError("Network error — please try again.");
    }
  };

  const resetForm = () => {
    setQuoteData(null);
    setQuoteItems([]);
    setBuilder(DEFAULT_BUILDER);
    setUploadedFiles([]);
    setPromoCode("");
    setPromoStatus(null);
    setSubmitError("");
    setCurrentStep(1);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", marginBottom: "1rem" };
  const sectionLabel = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", margin: "0 0 0.75rem" };
  const fieldLabel = { display: "block", fontSize: 12, fontWeight: 500, color: "var(--muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" };
  const inputBase = { width: "100%", height: 42, padding: "10px 12px", fontSize: 16, background: "#F8F7F5", border: "1px solid var(--border)", borderRadius: 8, outline: "none", boxSizing: "border-box", color: "#1E0033", fontFamily: "inherit", transition: "border-color 0.15s", colorScheme: "light", appearance: "none", WebkitAppearance: "none" };
  const inputErr = { ...inputBase, border: "1px solid #ff4444" };
  const twoCol = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginBottom: 14 };
  const errMsg = { fontSize: 11, color: "#ff4444", marginTop: 4 };
  const btnPrimary = { width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 600, background: "var(--accent)", border: "none", borderRadius: 50, cursor: "pointer", color: "#ffffff", fontFamily: "inherit", letterSpacing: "0.02em", transition: "opacity 0.15s" };
  const btnSecondary = { padding: "11px 24px", fontSize: 14, fontWeight: 500, background: "transparent", border: "1px solid var(--border)", borderRadius: 50, cursor: "pointer", color: "var(--muted)", fontFamily: "inherit" };

  const isStepCompleted = (n) => n < currentStep;
  const currentQualities = getQualities(builder.garmentType);
  const showBuilderColors = builder.decorationMethod === "Screen Printing" || builder.decorationMethod === "DTF" || builder.decorationMethod === "Embroidery";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1rem", fontFamily: "inherit" }}>

      {/* ── Success state ── */}
      {quoteData && (
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "3rem 1rem", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: "1rem" }}>🎉</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--foreground)", margin: "0 0 8px" }}>Quote Submitted!</h1>
          {quoteData.quoteId && (
            <p style={{ fontSize: 15, color: "var(--muted)", margin: "0 0 2rem" }}>
              Quote <strong style={{ color: "var(--foreground)" }}>#{quoteData.quoteId}</strong> has been received.
            </p>
          )}

          {/* Per-item summary */}
          {quoteData.summary?.quoteItems?.length > 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", marginBottom: "1rem", textAlign: "left" }}>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", margin: "0 0 0.75rem" }}>Order summary</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {quoteData.summary.quoteItems.map((item, i) => {
                  const est = computeItemEstimate(item);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: 13 }}>
                      <div>
                        <div style={{ color: "var(--foreground)", fontWeight: 500 }}>{item.garmentType} — {item.decorationMethod}</div>
                        <div style={{ color: "var(--muted)", marginTop: 2 }}>
                          {item.qty} qty{item.shirtColor ? ` · ${item.shirtColor}` : ""}
                          {itemShowsColors(item) ? ` · ${item.inkColors} ${item.decorationMethod === "Embroidery" ? "thread" : "ink"} color${item.inkColors > 1 ? "s" : ""}` : ""}
                        </div>
                      </div>
                      {est && <span style={{ color: "var(--foreground)", fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>~${est.subtotal.toFixed(2)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Total estimate */}
          {quoteData.summary?.totalEstimate && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.5rem", textAlign: "left" }}>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent)", margin: "0 0 0.75rem" }}>Estimated price</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
                  <span>Subtotal</span>
                  <span>${quoteData.summary.totalEstimate.subtotal.toFixed(2)}{quoteData.summary.totalEstimate.partial ? "*" : ""}</span>
                </div>
                {quoteData.summary.appliedPromo?.discountAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#00FF66" }}>
                    <span>Discount ({quoteData.summary.appliedPromo.message || quoteData.summary.appliedPromo.code})</span>
                    <span>−${quoteData.summary.appliedPromo.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
                  <span>Est. sales tax (7.5%)</span>
                  <span>${quoteData.summary.totalEstimate.salesTax.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "var(--foreground)", borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: 2 }}>
                  <span>Estimated total</span>
                  <span style={{ color: "var(--accent)" }}>${quoteData.summary.totalEstimate.totalPrice.toFixed(2)}</span>
                </div>
                {quoteData.summary.totalEstimate.partial && (
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0", opacity: 0.7 }}>* Embroidery and custom items confirmed after review.</p>
                )}
                <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0", opacity: 0.7 }}>Estimate only — final price confirmed after review.</p>
              </div>
            </div>
          )}

          {/* What happens next */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.5rem", textAlign: "left" }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", margin: "0 0 1rem" }}>What happens next</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "We'll review your quote within 1 business day.",
                `You'll receive an email at ${quoteData.email} when your quote is ready.`,
                "Once approved, we'll send you a proof to review before production.",
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#00FF66", color: "#000", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                  <p style={{ fontSize: 14, color: "var(--foreground)", margin: 0, lineHeight: 1.6 }}>{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Account prompt */}
          {!isSignedIn && !promptDismissed && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.5rem", textAlign: "left" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", margin: "0 0 6px" }}>Track your order online</p>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 1rem", lineHeight: 1.6 }}>
                Create a free account to check your order status and review proofs — no password needed.
              </p>
              <a href={`/login?email=${encodeURIComponent(quoteData.email || "")}`}
                style={{ display: "inline-block", padding: "10px 24px", borderRadius: 50, background: "#00FF66", color: "#000", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                Send me a login link →
              </a>
              <span style={{ display: "block", marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                Not required — you'll receive updates by email either way.
              </span>
              <button onClick={() => setPromptDismissed(true)}
                style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, cursor: "pointer", marginTop: 8, padding: 0 }}>
                No thanks, I'll watch for emails
              </button>
            </div>
          )}

          {isSignedIn && (
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <a href="/my-orders" style={{ color: "#00FF66", fontWeight: 600, fontSize: 15, textDecoration: "none" }}>View your orders →</a>
            </div>
          )}

          <button onClick={resetForm}
            style={{ padding: "12px 28px", borderRadius: 50, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Start a new quote
          </button>
        </div>
      )}

      {/* ── Form ── */}
      {!quoteData && (
        <div>
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
                    fontSize: 13, fontWeight: 700, flexShrink: 0, transition: "all 0.2s",
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

            {/* ══ STEP 1 — YOUR INFO ══════════════════════════════════════════ */}
            {currentStep === 1 && (
              <div style={card}>
                <StepHeader num={1} label="Your Info" />
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
                <button type="button" style={btnPrimary} onClick={goNext}>Continue →</button>
              </div>
            )}

            {/* ══ STEP 2 — YOUR ORDER (multi-garment builder) ═════════════════ */}
            {currentStep === 2 && (
              <div>
                {/* Added items list */}
                {quoteItems.length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    <p style={{ ...sectionLabel, marginBottom: 10 }}>
                      Your quote — {quoteItems.length} item{quoteItems.length !== 1 ? "s" : ""}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {quoteItems.map((item) => (
                          <div key={item.id} style={{
                            background: "var(--surface)", border: "1px solid var(--border)",
                            borderRadius: 10, padding: "0.875rem 1rem",
                            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                          }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", marginBottom: 2 }}>
                                {item.garmentType}
                                <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 4 }}>— {item.decorationMethod}</span>
                              </div>
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                {item.qty} qty
                                {item.shirtColor ? ` · ${item.shirtColor}` : ""}
                                {itemShowsColors(item) ? ` · ${item.inkColors} ${item.decorationMethod === "Embroidery" ? "thread" : "ink"} color${item.inkColors > 1 ? "s" : ""}` : ""}
                              </div>
                            </div>
                            <button type="button" onClick={() => removeItem(item.id)}
                              style={{ fontSize: 12, color: "#ff4444", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontFamily: "inherit", flexShrink: 0, marginLeft: 8 }}>
                              Remove
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Builder card */}
                <div style={card}>
                  <StepHeader num={2} label={quoteItems.length === 0 ? "Build Your Order" : "Add Another Garment"} />

                  {/* Garment type */}
                  <p style={sectionLabel}>What are you decorating?</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                    {GARMENT_TYPES.map((g) => (
                      <GarmentChip key={g.value} label={g.value} icon={g.icon} selected={builder.garmentType === g.value} onClick={() => handleBuilderGarmentType(g.value)} />
                    ))}
                  </div>

                  {/* Decoration method */}
                  <p style={sectionLabel}>Decoration method</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }}>
                    {DECORATION_METHODS.map((m) => (
                      <SelectCard key={m.value} selected={builder.decorationMethod === m.value} onClick={() => updateBuilder("decorationMethod", m.value)}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>{m.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{m.label}</div>
                      </SelectCard>
                    ))}
                  </div>

                  {/* Style / quality */}
                  <p style={sectionLabel}>Style</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                    {currentQualities.map((q) => {
                      const pricing = garmentPricing[q.itemNumber];
                      return (
                        <SelectCard key={q.itemNumber} selected={builder.shirtQuality === q.itemNumber} onClick={() => updateBuilder("shirtQuality", q.itemNumber)}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", marginBottom: 2 }}>{q.label}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{q.description}</div>
                          {pricing?.customerPrice && (
                            <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                              From ${pricing.customerPrice.toFixed(2)}/ea
                            </div>
                          )}
                        </SelectCard>
                      );
                    })}
                  </div>

                  {/* Color + Quantity */}
                  <div style={twoCol}>
                    <div>
                      <label style={fieldLabel}>Color</label>
                      <input style={inputBase} placeholder="e.g. Black, Navy"
                        value={builder.shirtColor}
                        onChange={(e) => updateBuilder("shirtColor", e.target.value)} />
                    </div>
                    <div>
                      <label style={fieldLabel}>Quantity *</label>
                      <input type="number" min="1"
                        style={builderError ? inputErr : inputBase}
                        placeholder="e.g. 48"
                        value={builder.qty}
                        onChange={(e) => { updateBuilder("qty", e.target.value); setBuilderError(""); }} />
                      {builderError && <p style={errMsg}>{builderError}</p>}
                    </div>
                  </div>

                  {/* Ink / thread colors */}
                  {showBuilderColors && (
                    <div style={{ marginBottom: 20 }}>
                      <label style={fieldLabel}>{inkColorLabel(builder.decorationMethod)}</label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <button key={n} type="button"
                            onClick={() => updateBuilder("inkColors", n)}
                            style={{
                              width: 42, height: 42, borderRadius: 8, fontSize: 14, fontWeight: 600,
                              border: `2px solid ${builder.inkColors === n ? "var(--accent)" : "var(--border)"}`,
                              background: builder.inkColors === n ? "rgba(0,255,102,0.08)" : "var(--surface)",
                              color: builder.inkColors === n ? "var(--foreground)" : "var(--muted)",
                              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                            }}>{n}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add to quote */}
                  <button type="button" onClick={addItemToQuote}
                    style={{
                      width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 600,
                      background: "var(--surface)", border: "2px solid var(--accent)",
                      borderRadius: 50, cursor: "pointer", color: "var(--accent)",
                      fontFamily: "inherit", letterSpacing: "0.02em", marginBottom: quoteItems.length > 0 ? 0 : 0,
                    }}>
                    + Add to Quote
                  </button>
                </div>

                {submitError && (
                  <p style={{ ...errMsg, marginBottom: 12, marginTop: -4 }}>{submitError}</p>
                )}

                {/* Navigation */}
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button type="button" style={btnSecondary} onClick={goBack}>← Back</button>
                  <button type="button"
                    style={{ ...btnPrimary, flex: 1, opacity: quoteItems.length === 0 ? 0.45 : 1 }}
                    onClick={goNext}>
                    {quoteItems.length === 0
                      ? "Add an item to continue"
                      : `Continue with ${quoteItems.length} item${quoteItems.length !== 1 ? "s" : ""} →`}
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 3 — ARTWORK ════════════════════════════════════════════ */}
            {currentStep === 3 && (
              <div style={card}>
                <StepHeader num={3} label="Artwork" />

                <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.6 }}>
                  Upload your artwork and assign each file a print location and color count. Don't have art yet? Skip ahead — we'll follow up.
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
                  <span style={{ display: "block", fontSize: 13, color: "var(--foreground)", marginBottom: 3, fontWeight: 500 }}>Drag & drop or click to upload</span>
                  <span style={{ fontSize: 11, color: "var(--muted)", opacity: 0.7 }}>PNG, JPG, PDF, AI, EPS, SVG</span>
                </div>

                {/* Per-file assignment */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {uploadedFiles.map((file, i) => (
                    <div key={i} style={{
                      background: "var(--background)",
                      border: `1px solid ${file.error ? "#ff4444" : file.uploading ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 10, padding: "0.9rem 1rem",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                          <span style={{ fontSize: 16 }}>{file.uploading ? "⏳" : file.error ? "❌" : "✅"}</span>
                          <span style={{ fontSize: 13, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{file.name}</span>
                          {file.uploading && <span style={{ fontSize: 11, color: "var(--accent)", flexShrink: 0 }}>Uploading…</span>}
                          {file.error && <span style={{ fontSize: 11, color: "#ff4444", flexShrink: 0 }}>{file.error}</span>}
                        </div>
                        <button type="button" onClick={() => removeFile(i)}
                          style={{ fontSize: 12, color: "#ff4444", background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, fontFamily: "inherit", marginLeft: 8 }}>
                          Remove
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={fieldLabel}>Print location</label>
                          <select style={inputBase} value={file.location || ""}
                            onChange={(e) => setUploadedFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, location: e.target.value } : f))}>
                            <option value="">Select location…</option>
                            {PRINT_LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={fieldLabel}>Ink colors</label>
                          <select style={inputBase} value={file.colors || 1}
                            onChange={(e) => setUploadedFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, colors: parseInt(e.target.value) } : f))}>
                            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} color{n > 1 ? "s" : ""}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button type="button" style={btnSecondary} onClick={goBack}>← Back</button>
                  <button type="button" style={{ ...btnPrimary, flex: 1 }} onClick={goNext}>Continue →</button>
                </div>
              </div>
            )}

            {/* ══ STEP 4 — REVIEW & SUBMIT ════════════════════════════════════ */}
            {currentStep === 4 && (
              <div style={card}>
                <StepHeader num={4} label="Review & Submit" />

                {/* Per-item review */}
                <div style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: 16 }}>
                  <p style={{ ...sectionLabel, marginBottom: 10 }}>Order items</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {quoteItems.map((item) => {
                      const est = computeItemEstimate(item);
                      return (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: 13 }}>
                          <div>
                            <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{item.garmentType} — {item.decorationMethod}</div>
                            <div style={{ color: "var(--muted)", marginTop: 2 }}>
                              {item.qty} qty
                              {item.shirtColor ? ` · ${item.shirtColor}` : ""}
                              {itemShowsColors(item) ? ` · ${item.inkColors} ${item.decorationMethod === "Embroidery" ? "thread" : "ink"} color${item.inkColors > 1 ? "s" : ""}` : ""}
                            </div>
                          </div>
                          <div style={{ flexShrink: 0, marginLeft: 8, textAlign: "right" }}>
                            {est
                              ? <span style={{ color: "var(--foreground)", fontWeight: 500 }}>~${est.subtotal.toFixed(2)}</span>
                              : <span style={{ color: "var(--muted)", fontSize: 11 }}>Pricing TBD</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, fontSize: 13, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
                    <span>Artwork files</span>
                    <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{uploadedFiles.filter((f) => f.url).length} uploaded</span>
                  </div>
                </div>

                {/* Total estimate */}
                {totalEstimate && (
                  <div style={{ background: "var(--background)", border: "1px solid var(--accent)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: 16 }}>
                    <p style={{ ...sectionLabel, margin: "0 0 0.6rem", color: "var(--accent)" }}>Estimated price</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
                        <span>Subtotal</span>
                        <span>${totalEstimate.subtotal.toFixed(2)}{totalEstimate.partial ? "*" : ""}</span>
                      </div>
                      {totalEstimate.promoDiscount > 0 && promoStatus?.message && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#00FF66" }}>
                          <span>Discount ({promoStatus.message.split(" — ")[0]})</span>
                          <span>−${totalEstimate.promoDiscount.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
                        <span>Est. sales tax (7.5%)</span>
                        <span>${totalEstimate.salesTax.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "var(--foreground)", borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: 2 }}>
                        <span>Estimated total</span>
                        <span style={{ color: "var(--accent)" }}>${totalEstimate.totalPrice.toFixed(2)}</span>
                      </div>
                      {totalEstimate.partial && (
                        <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0", opacity: 0.7 }}>* Embroidery and custom items confirmed after review.</p>
                      )}
                      <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0", opacity: 0.7 }}>Estimate only — final price confirmed after review.</p>
                    </div>
                  </div>
                )}

                {/* Promo code */}
                <div style={{ marginBottom: 16 }}>
                  <label style={fieldLabel}>Promo code <span style={{ fontWeight: 400, textTransform: "none", opacity: 0.6 }}>— optional</span></label>
                  <div style={{ position: "relative" }}>
                    <input
                      style={{ ...inputBase, paddingRight: promoCode ? 36 : 12 }}
                      placeholder="e.g. SUMMER25"
                      value={promoCode}
                      onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoStatus(null); }} />
                    {promoCode && (
                      <button type="button" onClick={() => { setPromoCode(""); setPromoStatus(null); }}
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--muted)", padding: 0, lineHeight: 1 }}>×</button>
                    )}
                  </div>
                  {promoChecking && <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Checking…</p>}
                  {!promoChecking && promoStatus?.valid && (
                    <p style={{ fontSize: 11, color: "#00FF66", marginTop: 4 }}>✓ {promoStatus.message}{promoStatus.isPersonalized ? " · Personalized offer" : ""}</p>
                  )}
                  {!promoChecking && promoStatus && !promoStatus.valid && (
                    <p style={{ fontSize: 11, color: "#ff4444", marginTop: 4 }}>{promoStatus.message}</p>
                  )}
                </div>

                {/* Notes */}
                <div style={{ marginBottom: 16 }}>
                  <label style={fieldLabel}>Notes / special requests <span style={{ fontWeight: 400, textTransform: "none", opacity: 0.6 }}>— optional</span></label>
                  <textarea style={{ ...inputBase, minHeight: 80, resize: "vertical" }} placeholder="Art details, rush timeline, size breakdowns, anything else helpful..." {...register("notes")} />
                </div>

                {/* Mailing list */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "0.75rem 0", borderTop: "1px solid var(--border)", marginBottom: 16 }}>
                  <input type="checkbox" id="mailing-list" style={{ width: 16, height: 16, margin: "2px 0 0", flexShrink: 0, cursor: "pointer", accentColor: "var(--accent)" }} {...register("mailingList")} />
                  <label htmlFor="mailing-list" style={{ fontSize: 13, color: "var(--foreground)", cursor: "pointer", lineHeight: 1.5 }}>
                    Add me to the mailing list
                    <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Get exclusive coupons, promos, and updates from Thread Giant.</span>
                  </label>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" style={btnSecondary} onClick={goBack}>← Back</button>
                  <button type="submit" disabled={isSubmitting}
                    style={{ ...btnPrimary, flex: 1, opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}>
                    {isSubmitting ? "Sending..." : "Submit 🚀"}
                  </button>
                </div>

                {submitError && (
                  <div style={{ background: "var(--surface)", border: "1px solid #ff4444", borderRadius: 8, padding: "0.75rem 1rem", fontSize: 13, color: "#ff4444", marginTop: "1rem" }}>
                    {submitError}
                  </div>
                )}
              </div>
            )}

          </form>
        </div>
      )}
    </div>
  );
}
