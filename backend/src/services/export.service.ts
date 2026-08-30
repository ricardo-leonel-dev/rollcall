import * as quarterService from './quarter.service';

const EXCEL_URL = () => process.env.EXCEL_SERVICE_URL || 'http://excel-service:8002';

export interface Signer { name: string; title: string; label: string; }

export async function exportExcel(
  institutionId: number,
  courseIds: number[],
  academicYearId: number,
  dateFrom: string,
  dateTo: string,
  signers: Signer[] = [],
  quarterId?: number,
): Promise<Response> {
  const signersParam = signers.length
    ? '&signers=' + encodeURIComponent(JSON.stringify(signers))
    : '';

  let quarterParam = '';
  if (quarterId !== undefined) {
    const quarter = await quarterService.findByIdForActiveYear(institutionId, quarterId);
    if (quarter.academicYearId !== academicYearId) {
      throw Object.assign(new Error('Trimestre no encontrado'), { status: 404 });
    }
    quarterParam = `&quarter_sequence=${quarter.sequenceNumber}&quarter_name=${encodeURIComponent(quarter.name)}`;
  }

  const url = `${EXCEL_URL()}/export/excel?institution_id=${institutionId}&course_ids=${courseIds.join(',')}&academic_year_id=${academicYearId}&date_from=${dateFrom}&date_to=${dateTo}${signersParam}${quarterParam}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw Object.assign(new Error(`Error en excel-service: ${text}`), { status: resp.status });
  }
  return resp;
}
