"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      Imprimer / enregistrer en PDF
    </button>
  );
}
