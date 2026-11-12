/**
 * Export Module
 * Generates formatted CSV for Excel with proper Italian separators and UTF-8 BOM.
 */

const ExportModule = {
  exportToCSV(filterData) {
    const shifts = filterData.shifts;
    if (!shifts || shifts.length === 0) {
      alert('Nessun dato da esportare per il periodo selezionato.');
      return;
    }

    const headers = [
      'Data',
      'Studio Dentistico',
      'Ora Inizio',
      'Ora Fine',
      'Pausa (minuti)',
      'Ore Lavorate Nette',
      'Pazienti Trattati',
      'Pazienti Previsti',
      'Formula Compenso',
      'Compenso Lordo (€)',
      'Accantonamento Tasse/INPS (€)',
      'Netto Stimato (€)',
      'Note'
    ];

    const rows = shifts.map(s => {
      const clinic = Storage.getClinic(s.clinicId) || { name: 'Studio', compModel: '' };
      const dateFormatted = new Date(s.date + 'T00:00:00').toLocaleDateString('it-IT');
      
      let paxDone = s.quickDone || 0;
      let paxPlanned = s.quickPlanned || 0;
      if (s.mode === 'detailed' && s.patients) {
        paxDone = s.patients.filter(p => p.status === 'done').length;
        paxPlanned = s.patients.length;
      }

      const tax = Storage.calculateTaxesAndNet(s.calculatedEarnings || 0);

      // Italian Excel uses semicolon separator and comma decimal
      const hoursStr = s.hoursWorked.toFixed(2).replace('.', ',');
      const grossStr = (s.calculatedEarnings || 0).toFixed(2).replace('.', ',');
      const taxStr = tax.totalReserve.toFixed(2).replace('.', ',');
      const netStr = tax.netAmount.toFixed(2).replace('.', ',');

      return [
        `"${dateFormatted}"`,
        `"${(clinic.name || '').replace(/"/g, '""')}"`,
        `"${s.startTime}"`,
        `"${s.endTime}"`,
        s.breakMinutes || 0,
        `"${hoursStr}"`,
        paxDone,
        paxPlanned,
        `"${ClinicsModule.getCompDescription(clinic).replace(/"/g, '""')}"`,
        `"${grossStr}"`,
        `"${taxStr}"`,
        `"${netStr}"`,
        `"${(s.notes || '').replace(/"/g, '""')}"`
      ].join(';');
    });

    // Prepend UTF-8 BOM so Excel opens Italian accents and currency symbols correctly
    const csvContent = '\uFEFF' + headers.join(';') + '\r\n' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const filename = `Rendiconto_${filterData.month || 'totale'}.csv`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
