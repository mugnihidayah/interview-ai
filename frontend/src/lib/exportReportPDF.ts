import type { FinalReport } from "@/lib/api";

export async function exportReportPDF(
  sessionId: string,
  report: FinalReport
) {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Helpers

  function checkPageBreak(needed: number) {
    if (y + needed > pageHeight - 25) {
      doc.addPage();
      y = margin;
    }
  }

  function addSectionTitle(title: string) {
    checkPageBreak(20);
    y += 6;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(title, margin, y);
    y += 2;
    // Underline
    doc.setDrawColor(100, 149, 237);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 1, margin + 50, y + 1);
    y += 8;
  }

  function addParagraph(text: string, color: number[] = [80, 80, 80]) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, contentWidth);
    checkPageBreak(lines.length * 5 + 4);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  }

  function addBulletList(
    items: string[],
    bullet: string = "•",
    color: number[] = [80, 80, 80]
  ) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(color[0], color[1], color[2]);

    items.forEach((item) => {
      const lines = doc.splitTextToSize(
        `${bullet}  ${item}`,
        contentWidth - 5
      );
      checkPageBreak(lines.length * 5 + 3);
      doc.text(lines, margin + 3, y);
      y += lines.length * 5 + 3;
    });
  }

  // Header

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 45, "F");

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Interview AI", margin, 18);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 230);
  doc.text("Coaching Report", margin, 28);

  doc.setFontSize(9);
  doc.setTextColor(140, 160, 190);
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    margin,
    37
  );

  y = 55;

  // Overall Score

  const scoreColor: number[] =
    report.overall_score >= 80
      ? [34, 197, 94]
      : report.overall_score >= 60
        ? [59, 130, 246]
        : report.overall_score >= 40
          ? [234, 179, 8]
          : [239, 68, 68];

  doc.setFontSize(36);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.text(`${Math.round(report.overall_score)}`, margin, y);

  doc.setFontSize(14);
  doc.setTextColor(120, 120, 120);
  doc.text("/100", margin + 32, y);

  // Grade badge
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.text(`Grade: ${report.overall_grade}`, margin + 60, y);

  // Readiness
  const readyText = report.ready_for_role ? "✓ Ready" : "✗ Not Ready";
  const readyColor: number[] = report.ready_for_role
    ? [34, 197, 94]
    : [234, 179, 8];
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(readyColor[0], readyColor[1], readyColor[2]);
  doc.text(readyText, pageWidth - margin - 30, y);

  y += 16;

  // Summary

  addSectionTitle("Summary");
  addParagraph(report.summary);

  // Readiness Explanation

  addSectionTitle("Readiness Assessment");
  addParagraph(report.ready_explanation);

  // Top Strengths

  addSectionTitle("Top Strengths");
  addBulletList(report.top_strengths, "✓", [34, 140, 80]);

  // Areas to Improve

  addSectionTitle("Areas to Improve");
  addBulletList(report.areas_to_improve, "△", [200, 120, 20]);

  // Action Items

  addSectionTitle("Action Items");
  report.action_items.forEach((item, i) => {
    const lines = doc.splitTextToSize(
      `${i + 1}. ${item}`,
      contentWidth - 5
    );
    checkPageBreak(lines.length * 5 + 3);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 90, 180);
    doc.text(lines, margin + 3, y);
    y += lines.length * 5 + 3;
  });

  // Per-Question Breakdown

  addSectionTitle("Question-by-Question Breakdown");

  report.per_question_feedback.forEach((qf) => {
    checkPageBreak(60);

    // Question header
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    const qTitle = `Q${qf.question_number}. (Score: ${qf.score}/10)`;
    doc.text(qTitle, margin, y);
    y += 6;

    // Question text
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    const qLines = doc.splitTextToSize(qf.question, contentWidth - 5);
    checkPageBreak(qLines.length * 5 + 4);
    doc.text(qLines, margin + 3, y);
    y += qLines.length * 5 + 4;

    // Candidate answer
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    const aLabel = "Your Answer:";
    doc.setFont("helvetica", "bold");
    doc.text(aLabel, margin + 3, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    const aLines = doc.splitTextToSize(qf.candidate_answer, contentWidth - 10);
    const displayLines = aLines.slice(0, 6); // Limit to 6 lines
    checkPageBreak(displayLines.length * 4.5 + 4);
    doc.text(displayLines, margin + 5, y);
    y += displayLines.length * 4.5 + 2;

    if (aLines.length > 6) {
      doc.setTextColor(140, 140, 140);
      doc.text("(truncated...)", margin + 5, y);
      y += 5;
    }

    // Feedback
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 90, 160);
    doc.text("Feedback:", margin + 3, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 90, 160);
    const fLines = doc.splitTextToSize(qf.feedback, contentWidth - 10);
    checkPageBreak(fLines.length * 4.5 + 4);
    doc.text(fLines, margin + 5, y);
    y += fLines.length * 4.5 + 2;

    // Better answer
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(34, 140, 80);
    doc.text("Better Answer:", margin + 3, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    const bLines = doc.splitTextToSize(qf.better_answer, contentWidth - 10);
    const displayBLines = bLines.slice(0, 6);
    checkPageBreak(displayBLines.length * 4.5 + 4);
    doc.text(displayBLines, margin + 5, y);
    y += displayBLines.length * 4.5 + 2;

    if (bLines.length > 6) {
      doc.setTextColor(140, 140, 140);
      doc.text("(truncated...)", margin + 5, y);
      y += 5;
    }

    // Separator
    y += 4;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  });

  // Footer on all pages

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Interview AI — Coaching Report • Page ${i}/${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  }

  // Save

  const shortId = sessionId.slice(0, 8);
  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`interview-report-${shortId}-${dateStr}.pdf`);
}