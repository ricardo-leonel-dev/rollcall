const OCR_URL = () => process.env.OCR_SERVICE_URL || 'http://ocr-service:8001';

export async function exportExcel(courseId: number, academicYearId: number, dateFrom: string, dateTo: string): Promise<Response> {
  const url = `${OCR_URL()}/export/excel?course_id=${courseId}&academic_year_id=${academicYearId}&date_from=${dateFrom}&date_to=${dateTo}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw Object.assign(new Error(`Error en OCR service: ${text}`), { status: resp.status });
  }
  return resp;
}
