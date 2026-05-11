'use client';

import { useState, useCallback } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { calcUnitCost } from "@/lib/pricing";

// ─── Config ────────────────────────────────────────────────────────────────
const CATEGORY_ID = "178403";

// ─── Shirt quality options ─────────────────────────────────────────────────
const SHIRT_QUALITIES = [
  { label: "Standard", itemNumber: "5000" },
  { label: "Premium", itemNumber: "6210" },
];

// ─── Pricing Matrix (2026) ─────────────────────────────────────────────────

const GARMENT_TYPES = ["T-Shirt", "Hoodie", "Sweatshirt", "Long Sleeve", "Headwear"];
const PRINT_LOCATIONS = ["Front chest", "Back full", "Left chest", "Right chest", "Sleeve left", "Sleeve right", "Nape", "Custom"];

// ─── Sub-components ────────────────────────────────────────────────────────

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
      <span
        style={{
          width: 14,
          height: 14,
          border: `1px solid ${selected ? "#ffffff" : "var(--muted)"}`,
          borderRadius: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          flexShrink: 0,
          color: selected ? "#ffffff" : "var(--muted)",
        }}
      >
        {selected ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

function Toggle({ on, onToggle, label, hint }) {
  return (
    <div style={{ marginBottom: on ? 12 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>
          {label}
        </span>
        <div
          onClick={onToggle}
          style={{
            position: "relative",
            width: 36,
            height: 20,
            background: on ? "var(--accent)" : "var(--border)",
            borderRadius: 10,
            cursor: "pointer",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 3,
              left: on ? 17 : 3,
              width: 14,
              height: 14,
              background: "#fff",
              borderRadius: "50%",
              transition: "left 0.2s",
            }}
          />
        </div>
      </div>
      {!on && <p style={{ fontSize: 11, color: "var(--muted)", margin: 0, opacity: 0.7 }}>{hint}</p>}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function QuoteForm() {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      fname: "",
      lname: "",
      email: "",
      phone: "",
      company: "",
      dueDate: "",
      qty: "",
      decorationMethod: "Screen Printing",
      inkColors: 1,
      shirtQuality: "5000",
      shirtColor: "",
      jobName: "",
      notes: "",
      mailingList: true,
      locations: [{ name: "Front chest", colors: 1, art: "" }],
    },
  });

  const { fields: locationFields, append: appendLocation, remove: removeLocation } = useFieldArray({
    control,
    name: "locations",
  });

  const [selectedGarments, setSelectedGarments] = useState([]);
  const [locsEnabled, setLocsEnabled] = useState(false);
  const [addressEnabled, setAddressEnabled] = useState(false);
  const [shippingSameAsBilling, setShippingSameAsBilling] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState([]); // [{ name, url, uploading, error }]
  const [dragOver, setDragOver] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const toggleGarment = (g) => {
    setSelectedGarments((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  const handleFiles = useCallback(async (files) => {
    const incoming = Array.from(files).filter(
      (f) => !uploadedFiles.find((u) => u.name === f.name)
    );
    if (incoming.length === 0) return;

    // Add placeholders immediately so the user sees them
    const placeholders = incoming.map((f) => ({ name: f.name, url: null, uploading: true, error: null }));
    setUploadedFiles((prev) => [...prev, ...placeholders]);

    // Upload each file to Vercel Blob
    for (const file of incoming) {
      try {
        const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          body: file,
        });
        const blob = await res.json();
        setUploadedFiles((prev) =>
          prev.map((f) => f.name === file.name ? { name: file.name, url: blob.url, uploading: false, error: null } : f)
        );
      } catch {
        setUploadedFiles((prev) =>
          prev.map((f) => f.name === file.name ? { name: file.name, url: null, uploading: false, error: 'Upload failed' } : f)
        );
      }
    }
  }, [uploadedFiles]);

  const removeFile = (i) => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i));

  const onSubmit = async (data) => {
    setSubmitError("");
    setSubmitSuccess("");

    if (selectedGarments.length === 0) {
      setSubmitError("Please select at least one garment type.");
      return;
    }

    const q = parseInt(data.qty);
    const activeLocs = locsEnabled ? data.locations : [];
    const locSummary =
      activeLocs.length > 0
        ? activeLocs.map((l) => `${l.name} (${l.colors} color${l.colors > 1 ? "s" : ""}): ${l.art}`).join(" | ")
        : null;

    // ── Pricing lookup ──
    const unitCost = calcUnitCost(data.qty, data.inkColors, locsEnabled, data.locations);
    const resolvedUnitCost = unitCost != null ? unitCost.toFixed(2) : "0.00";

    const resolvedJobName = data.jobName.trim() || `${selectedGarments.join(" + ")} — ${data.fname}`;

    const lineItems = selectedGarments.map((g) => ({
      style_description: g,
      size_other: String(q),
      category_id: CATEGORY_ID,
      unit_cost: resolvedUnitCost,
      ink_colors: data.inkColors,
    }));

    // Only submit once all files have finished uploading
    const stillUploading = uploadedFiles.some((f) => f.uploading);
    if (stillUploading) {
      setSubmitError("Please wait for your files to finish uploading.");
      return;
    }

    const artworkUrls = uploadedFiles
      .filter((f) => f.url)
      .map((f) => ({ name: f.name, url: f.url }));

    try {
      const res = await fetch("/api/submit-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fname: data.fname,
          lname: data.lname,
          email: data.email,
          phone: data.phone,
          company: data.company,
          dueDate: data.dueDate,
          notes: data.notes,
          jobName: resolvedJobName,
          decorationMethod: data.decorationMethod,
          inkColors: data.inkColors,
          qty: data.qty,
          shirtQuality: data.shirtQuality || "5000",
          shirtColor: data.shirtColor || null,
          garmentTypes: selectedGarments,
          locations: locsEnabled ? data.locations : [],
          locsEnabled,
          artworkUrls,
          // Address — only sent if the user filled it in (new customers only)
          billingAddress: addressEnabled ? {
            address1: data.billingAddress1 || null,
            address2: data.billingAddress2 || null,
            city: data.billingCity || null,
            state: data.billingState || null,
            zip: data.billingZip || null,
          } : null,
          shippingAddress: addressEnabled ? (shippingSameAsBilling ? {
            address1: data.billingAddress1 || null,
            address2: data.billingAddress2 || null,
            city: data.billingCity || null,
            state: data.billingState || null,
            zip: data.billingZip || null,
          } : {
            address1: data.shippingAddress1 || null,
            address2: data.shippingAddress2 || null,
            city: data.shippingCity || null,
            state: data.shippingState || null,
            zip: data.shippingZip || null,
          }) : null,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setSubmitError(json.error || "Something went wrong. Please try again.");
        return;
      }

      setSubmitSuccess("Quote submitted! We'll be in touch soon.");
    } catch (err) {
      console.error(err);
      setSubmitError("Network error — please try again or email us directly.");
    }
  };

  // ── Shared styles using CSS vars ──
  const card = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "1.5rem",
    marginBottom: "1rem",
  };
  const sectionLabel = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--muted)",
    margin: "0 0 0.75rem",
  };
  const fieldLabel = {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--muted)",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    height: 18,
  };
  const inputBase = {
    width: "100%",
    height: 42,
    padding: "10px 12px",
    fontSize: 14,
    background: "#F8F7F5",
    border: "1px solid var(--border)",
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box",
    color: "#1E0033",
    fontFamily: "inherit",
    transition: "border-color 0.15s",
    colorScheme: "light",
    appearance: "none",
    WebkitAppearance: "none",
  };
  const inputErr = { ...inputBase, border: "1px solid #ff4444" };
  const twoCol = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginBottom: 14 };
  const threeCol = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 14 };
  const errMsg = { fontSize: 11, color: "#ff4444", marginTop: 4 };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem", fontFamily: "inherit" }}>

      {/* Page heading */}
      <div style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, color: "var(--foreground)", margin: "0 0 0.5rem" }}>
          Get a <span style={{ color: "#00FF66" }}>Free Quote</span>
        </h1>
        <p style={{ fontSize: 15, color: "var(--muted)", margin: 0 }}>
          Fill out the form below and we'll get back to you fast.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>

        {/* ── Customer info ── */}
        <div style={card}>
          <p style={sectionLabel}>Your info</p>
          <div style={twoCol}>
            <div>
              <label style={fieldLabel}>First name *</label>
              <input
                style={errors.fname ? inputErr : inputBase}
                placeholder="Alex"
                {...register("fname", { required: "First name is required" })}
              />
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
              <input
                type="email"
                style={errors.email ? inputErr : inputBase}
                placeholder="alex@company.com"
                {...register("email", {
                  required: "Email is required",
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" },
                })}
              />
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

          {/* ── Optional billing + shipping address ── */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 4 }}>
            <Toggle
              on={addressEnabled}
              onToggle={() => setAddressEnabled((v) => !v)}
              label="Billing &amp; shipping address — optional"
              hint="Add your address to save time. Only needed for new customers."
            />
            {addressEnabled && (
              <div style={{ marginTop: 14 }}>
                {/* Billing */}
                <p style={{ ...sectionLabel, marginBottom: 10 }}>Billing address</p>
                <div style={{ marginBottom: 14 }}>
                  <label style={fieldLabel}>Address line 1</label>
                  <input style={inputBase} placeholder="123 Main St" {...register("billingAddress1")} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={fieldLabel}>Address line 2</label>
                  <input style={inputBase} placeholder="Suite 100 (optional)" {...register("billingAddress2")} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={fieldLabel}>City</label>
                    <input style={inputBase} placeholder="Charlotte" {...register("billingCity")} />
                  </div>
                  <div>
                    <label style={fieldLabel}>State</label>
                    <input style={inputBase} placeholder="NC" maxLength={2} {...register("billingState")} />
                  </div>
                  <div>
                    <label style={fieldLabel}>Zip</label>
                    <input style={inputBase} placeholder="28201" {...register("billingZip")} />
                  </div>
                </div>

                {/* Same as billing checkbox */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <input
                    type="checkbox"
                    id="shipping-same"
                    checked={shippingSameAsBilling}
                    onChange={(e) => setShippingSameAsBilling(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--accent)", flexShrink: 0 }}
                  />
                  <label htmlFor="shipping-same" style={{ fontSize: 13, color: "var(--foreground)", cursor: "pointer" }}>
                    Shipping address same as billing
                  </label>
                </div>

                {/* Shipping (only shown when not same as billing) */}
                {!shippingSameAsBilling && (
                  <>
                    <p style={{ ...sectionLabel, marginBottom: 10 }}>Shipping address</p>
                    <div style={{ marginBottom: 14 }}>
                      <label style={fieldLabel}>Address line 1</label>
                      <input style={inputBase} placeholder="123 Main St" {...register("shippingAddress1")} />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={fieldLabel}>Address line 2</label>
                      <input style={inputBase} placeholder="Suite 100 (optional)" {...register("shippingAddress2")} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14, marginBottom: 0 }}>
                      <div>
                        <label style={fieldLabel}>City</label>
                        <input style={inputBase} placeholder="Charlotte" {...register("shippingCity")} />
                      </div>
                      <div>
                        <label style={fieldLabel}>State</label>
                        <input style={inputBase} placeholder="NC" maxLength={2} {...register("shippingState")} />
                      </div>
                      <div>
                        <label style={fieldLabel}>Zip</label>
                        <input style={inputBase} placeholder="28201" {...register("shippingZip")} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Garments ── */}
        <div style={card}>
          <p style={sectionLabel}>
            Garment types *{" "}
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: 0.6 }}>
              — select all that apply
            </span>
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
            {GARMENT_TYPES.map((g) => (
              <GarmentChip
                key={g}
                label={g}
                selected={selectedGarments.includes(g)}
                onToggle={() => toggleGarment(g)}
              />
            ))}
          </div>
          {submitError && submitError.includes("garment") && (
            <p style={{ ...errMsg, marginBottom: 8 }}>{submitError}</p>
          )}

          <div style={twoCol}>
            <div>
              <label style={fieldLabel}>Shirt quality</label>
              <select style={inputBase} {...register("shirtQuality")}>
                {SHIRT_QUALITIES.map((q) => (
                  <option key={q.itemNumber} value={q.itemNumber}>{q.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Shirt color</label>
              <input
                style={inputBase}
                placeholder="e.g. Black, White, Navy"
                {...register("shirtColor")}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Decoration method *</label>
            <select
              style={errors.decorationMethod ? inputErr : inputBase}
              {...register("decorationMethod", { required: "Please select a decoration method" })}
            >
              <option value="Screen Printing">Screen Printing</option>
              <option value="Embroidery">Embroidery</option>
              <option value="Both">Both</option>
              <option value="Not Sure">Not Sure</option>
            </select>
            {errors.decorationMethod && <p style={errMsg}>{errors.decorationMethod.message}</p>}
          </div>

          <div style={twoCol}>
            <div>
              <label style={fieldLabel}>Quantity *</label>
              <input
                type="number"
                min="1"
                style={errors.qty ? inputErr : inputBase}
                placeholder="e.g. 48"
                {...register("qty", {
                  required: "Quantity is required",
                  min: { value: 1, message: "Must be at least 1" },
                })}
              />
              {errors.qty && <p style={errMsg}>{errors.qty.message}</p>}
            </div>
            <div>
              <label style={fieldLabel}>Colors</label>
              <Controller
                name="inkColors"
                control={control}
                render={({ field }) => (
                  <select style={inputBase} {...field} onChange={(e) => field.onChange(parseInt(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n} color{n > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                )}
              />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Job name</label>
            <input style={inputBase} placeholder="Spring 2026 order" {...register("jobName")} />
          </div>
        </div>

        {/* ── Print locations ── */}
        <div style={card}>
          <Toggle
            on={locsEnabled}
            onToggle={() => setLocsEnabled((v) => !v)}
            label="Print locations — optional"
            hint="Toggle on to specify locations and ink colors per location. Leave off for a general quote."
          />
          {locsEnabled && (
            <>
              {locationFields.map((field, i) => (
                <div
                  key={field.id}
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "1rem",
                    marginBottom: 8,
                    marginTop: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                      Location {i + 1}
                    </span>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => removeLocation(i)}
                        style={{
                          fontSize: 12,
                          color: "#ff4444",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontFamily: "inherit",
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div style={twoCol}>
                    <div>
                      <label style={fieldLabel}>Location</label>
                      <select style={inputBase} {...register(`locations.${i}.name`)}>
                        {PRINT_LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={fieldLabel}>Colors</label>
                      <Controller
                        name={`locations.${i}.colors`}
                        control={control}
                        render={({ field }) => (
                          <select style={inputBase} {...field} onChange={(e) => field.onChange(parseInt(e.target.value))}>
                            {[1, 2, 3, 4, 5, 6].map((n) => (
                              <option key={n} value={n}>{n} color{n > 1 ? "s" : ""}</option>
                            ))}
                          </select>
                        )}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={fieldLabel}>Art description</label>
                    <input
                      style={inputBase}
                      placeholder="e.g. front logo"
                      {...register(`locations.${i}.art`)}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => appendLocation({ name: "Front chest", colors: 1, art: "" })}
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  background: "none",
                  border: "1px solid var(--accent)",
                  borderRadius: 8,
                  padding: "6px 14px",
                  cursor: "pointer",
                  marginTop: 4,
                  fontFamily: "inherit",
                  transition: "opacity 0.15s",
                }}
              >
                + Add print location
              </button>
            </>
          )}
        </div>

        {/* ── Artwork ── */}
        <div style={card}>
          <p style={sectionLabel}>
            Artwork{" "}
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: 0.6 }}>
              — optional
            </span>
          </p>
          <div
            style={{
              background: "var(--background)",
              border: "1px solid var(--accent)",
              borderRadius: 8,
              padding: "0.75rem 1rem",
              fontSize: 12,
              color: "var(--accent)",
              marginBottom: 10,
              lineHeight: 1.6,
            }}
          >
            Upload your artwork and it will be attached directly to your Printavo quote. PNG, JPG, PDF, AI, EPS, SVG accepted.
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => document.getElementById("qf-file-input").click()}
            style={{
              border: `1px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 8,
              padding: "1.5rem 1rem",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "var(--surface)" : "transparent",
              marginBottom: 8,
              transition: "all 0.15s",
            }}
          >
            <input
              id="qf-file-input"
              type="file"
              accept="image/*,.pdf,.ai,.eps,.svg"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />
            <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 3 }}>
              Drag & drop or click to select artwork files
            </span>
            <span style={{ fontSize: 11, color: "var(--muted)", opacity: 0.6 }}>
              PNG, JPG, PDF, AI, EPS, SVG — uploaded directly to your Printavo quote
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {uploadedFiles.map((file, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--background)",
                  border: `1px solid ${file.error ? "#ff4444" : file.uploading ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 8,
                  padding: "7px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                  <span style={{ fontSize: 12, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.name}
                  </span>
                  <span style={{ fontSize: 11, color: file.error ? "#ff4444" : "var(--muted)", flexShrink: 0 }}>
                    {file.uploading ? "Uploading…" : file.error ? file.error : "✓ Ready"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  style={{ fontSize: 12, color: "#ff4444", background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, fontFamily: "inherit" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Notes + mailing + submit ── */}
        <div style={card}>
          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>
              Notes / special requests{" "}
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: 0.6 }}>— optional</span>
            </label>
            <textarea
              style={{ ...inputBase, minHeight: 80, resize: "vertical" }}
              placeholder="Art details, colors, rush timeline, anything else helpful..."
              {...register("notes")}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "0.75rem 0", borderTop: "1px solid var(--border)" }}>
            <input
              type="checkbox"
              id="mailing-list"
              style={{ width: 16, height: 16, margin: "2px 0 0", flexShrink: 0, cursor: "pointer", accentColor: "var(--accent)" }}
              {...register("mailingList")}
            />
            <label htmlFor="mailing-list" style={{ fontSize: 13, color: "var(--foreground)", cursor: "pointer", lineHeight: 1.5 }}>
              Add me to the mailing list
              <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                Get exclusive coupons, promos, and updates from <span style={{ fontVariant: "small-caps" }}>Thread Giant</span>.
              </span>
            </label>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "1rem 0" }} />

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "12px 0",
              fontSize: 15,
              fontWeight: 600,
              background: isSubmitting ? "var(--border)" : "var(--accent)",
              border: "none",
              borderRadius: 50,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              color: "#ffffff",
              opacity: isSubmitting ? 0.6 : 1,
              transition: "opacity 0.15s",
              fontFamily: "inherit",
              letterSpacing: "0.02em",
            }}
          >
            {isSubmitting ? "Sending..." : "Submit Quote Request"}
          </button>

          {submitError && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid #ff4444",
                borderRadius: 8,
                padding: "0.75rem 1rem",
                fontSize: 13,
                color: "#ff4444",
                marginTop: "1rem",
              }}
            >
              {submitError}
            </div>
          )}
          {submitSuccess && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid #00FF66",
                borderRadius: 8,
                padding: "0.75rem 1rem",
                fontSize: 13,
                color: "#00FF66",
                marginTop: "1rem",
                lineHeight: 1.6,
              }}
            >
              {submitSuccess}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
