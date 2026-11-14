/**
 * Reports & Accounting Module (Rendiconto)
 * Generates monthly accounting summaries, KPIs, clinic comparisons,
 * and printable pro-forma billing attachments.
 */

const ReportsModule = {
  currentMonth: new Date().toISOString().slice(0, 7), // 'YYYY-MM'
  currentClinicId: '',
  selectedTaxRegime: null,
  customTaxRate: null,

  init() {
    this.bindEvents();
    this.initMonthSelector();
    this.render();
  },

  bindEvents() {
    const monthSelect = document.getElementById('report-month-select');
    if (monthSelect) {
      monthSelect.addEventListener('change', (e) => {
        this.currentMonth = e.target.value;
        this.render();
      });
    }

    const clinicSelect = document.getElementById('report-clinic-select');
    if (clinicSelect) {
      clinicSelect.addEventListener('change', (e) => {
        this.currentClinicId = e.target.value;
        this.render();
      });
    }

    const taxRegimeSelect = document.getElementById('tax-regime-select');
    if (taxRegimeSelect) {
      taxRegimeSelect.addEventListener('change', (e) => {
        this.selectedTaxRegime = e.target.value;
        const customWrap = document.getElementById('custom-tax-input-wrap');
        if (customWrap) {
          customWrap.style.display = e.target.value === 'custom_free' ? 'flex' : 'none';
        }
        this.render();
      });
    }

    const customTaxInput = document.getElementById('custom-tax-rate-input');
    if (customTaxInput) {
      customTaxInput.addEventListener('input', (e) => {
        this.customTaxRate = parseFloat(e.target.value) || 28;
        this.render();
      });
    }

    const btnPrint = document.getElementById('btn-print-report');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => window.print());
    }

    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) {
      btnExportExcel.addEventListener('click', () => ExportModule.exportToCSV(this.getFilteredData()));
    }
  },

  initMonthSelector() {
    const monthSelect = document.getElementById('report-month-select');
    if (!monthSelect) return;

    // Generate last 12 months + current
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      options.push(`<option value="${val}" ${i === 0 ? 'selected' : ''}>${label.charAt(0).toUpperCase() + label.slice(1)}</option>`);
    }
    monthSelect.innerHTML = options.join('');
    this.currentMonth = monthSelect.value;
  },

  updateClinicFilter() {
    const clinicSelect = document.getElementById('report-clinic-select');
    if (!clinicSelect) return;

    const clinics = Storage.getClinics();
    clinicSelect.innerHTML = `<option value="">Tutti gli studi dentistici</option>` +
      clinics.map(c => `<option value="${c.id}" ${this.currentClinicId === c.id ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>`).join('');
  },

  getFilteredData() {
    let shifts = Storage.getShifts();

    if (this.currentMonth) {
      shifts = shifts.filter(s => s.date.startsWith(this.currentMonth));
    }

    if (this.currentClinicId) {
      shifts = shifts.filter(s => s.clinicId === this.currentClinicId);
    }

    // Sort ascending for chronological reporting
    shifts.sort((a, b) => a.date.localeCompare(b.date));

    return {
      month: this.currentMonth,
      clinicId: this.currentClinicId,
      shifts: shifts
    };
  },

  render() {
    this.updateClinicFilter();
    const data = this.getFilteredData();
    const profile = Storage.getProfile();
    const clinics = Storage.getClinics();

    // Metrics calculation
    let totalEarnings = 0;
    let totalHours = 0;
    let totalPatientsDone = 0;
    let totalPatientsPlanned = 0;
    let totalPatientsCancelled = 0;
    const clinicBreakdown = {};

    data.shifts.forEach(s => {
      const clinic = Storage.getClinic(s.clinicId) || { name: 'Studio', color: '#64748b' };
      const hours = s.hoursWorked || 0;
      const earnings = s.calculatedEarnings || 0;

      let done = s.quickDone || 0;
      let planned = s.quickPlanned || 0;
      let cancelled = s.quickCancelled || 0;

      if (s.mode === 'detailed' && s.patients) {
        done = s.patients.filter(p => p.status === 'done').length;
        planned = s.patients.length;
        cancelled = s.patients.filter(p => p.status !== 'done').length;
      }

      totalEarnings += earnings;
      totalHours += hours;
      totalPatientsDone += done;
      totalPatientsPlanned += planned;
      totalPatientsCancelled += cancelled;

      if (!clinicBreakdown[s.clinicId]) {
        clinicBreakdown[s.clinicId] = {
          clinic,
          hours: 0,
          earnings: 0,
          patients: 0,
          shiftCount: 0
        };
      }
      clinicBreakdown[s.clinicId].hours += hours;
      clinicBreakdown[s.clinicId].earnings += earnings;
      clinicBreakdown[s.clinicId].patients += done;
      clinicBreakdown[s.clinicId].shiftCount += 1;
    });

    const avgHourlyEarnings = totalHours > 0 ? (totalEarnings / totalHours).toFixed(2) : '0.00';
    const avgPatientsPerHour = totalHours > 0 ? (totalPatientsDone / totalHours).toFixed(1) : '0.0';

    // Update KPI UI
    document.getElementById('kpi-total-earnings').textContent = `${totalEarnings.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    document.getElementById('kpi-total-hours').textContent = `${totalHours.toFixed(1)} h`;
    document.getElementById('kpi-total-patients').textContent = `${totalPatientsDone} pz`;
    document.getElementById('kpi-total-shifts').textContent = `${data.shifts.length} turni`;
    document.getElementById('kpi-avg-hourly').textContent = `${avgHourlyEarnings} €/h`;
    document.getElementById('kpi-avg-pax-hour').textContent = `${avgPatientsPerHour} pz/h`;

    // Initialize Tax Regime selection if not set
    if (!this.selectedTaxRegime) {
      this.selectedTaxRegime = profile.taxRegime || 'forfettario_15';
    }
    const regSelect = document.getElementById('tax-regime-select');
    if (regSelect) regSelect.value = this.selectedTaxRegime;

    if (this.customTaxRate === null) {
      this.customTaxRate = profile.customTaxRate || 28;
    }
    const rateInput = document.getElementById('custom-tax-rate-input');
    if (rateInput) rateInput.value = this.customTaxRate;

    const customWrap = document.getElementById('custom-tax-input-wrap');
    if (customWrap) {
      customWrap.style.display = this.selectedTaxRegime === 'custom_free' ? 'flex' : 'none';
    }

    // Calculate Taxes & Net
    const taxData = Storage.calculateTaxesAndNet(totalEarnings, this.selectedTaxRegime, this.customTaxRate);

    // Update Tax & Net UI
    const grossEl = document.getElementById('tax-val-gross');
    if (grossEl) grossEl.textContent = `${totalEarnings.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

    const reserveEl = document.getElementById('tax-val-reserve');
    if (reserveEl) reserveEl.textContent = `- ${taxData.totalReserve.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

    const pctReserveEl = document.getElementById('tax-pct-reserve');
    if (pctReserveEl) pctReserveEl.textContent = `Accantonamento stimato (${taxData.effectiveRatePct.toFixed(1)}%)`;

    const netEl = document.getElementById('tax-val-net');
    if (netEl) netEl.textContent = `${taxData.netAmount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

    const pctNetEl = document.getElementById('tax-pct-net');
    if (pctNetEl) pctNetEl.textContent = `I soldi realmente tuoi in tasca (${taxData.netRatePct.toFixed(1)}%)`;

    const barNet = document.getElementById('tax-bar-net');
    if (barNet) barNet.style.width = `${taxData.netRatePct}%`;

    const barReserve = document.getElementById('tax-bar-reserve');
    if (barReserve) barReserve.style.width = `${taxData.effectiveRatePct}%`;

    const legNet = document.getElementById('legend-net-val');
    if (legNet) legNet.textContent = `${taxData.netAmount.toFixed(2)} €`;

    const legReserve = document.getElementById('legend-reserve-val');
    if (legReserve) legReserve.textContent = `${taxData.totalReserve.toFixed(2)} €`;

    const inpsEl = document.getElementById('tax-breakdown-inps');
    if (inpsEl) inpsEl.textContent = `~${taxData.inpsAmount.toFixed(2)} €`;

    const taxesEl = document.getElementById('tax-breakdown-taxes');
    if (taxesEl) taxesEl.textContent = `~${taxData.taxAmount.toFixed(2)} €`;

    const tipAmountEl = document.getElementById('tax-tip-reserve-amount');
    if (tipAmountEl) tipAmountEl.textContent = `${taxData.totalReserve.toFixed(2)} €`;

    // Render Clinic Breakdown Cards
    const breakdownContainer = document.getElementById('report-clinic-breakdown');
    if (breakdownContainer) {
      const breakdownEntries = Object.values(clinicBreakdown);
      if (breakdownEntries.length === 0) {
        breakdownContainer.innerHTML = '<div class="empty-hint">Nessun dato registrato per il periodo selezionato.</div>';
      } else {
        breakdownContainer.innerHTML = breakdownEntries.map(b => {
          const pct = totalEarnings > 0 ? ((b.earnings / totalEarnings) * 100).toFixed(0) : 0;
          return `
            <div class="clinic-summary-card" style="border-left: 4px solid ${b.clinic.color}">
              <div class="csc-title">
                <span class="color-dot-sm" style="background-color: ${b.clinic.color}"></span>
                <strong>${this.escapeHtml(b.clinic.name)}</strong>
              </div>
              <div class="csc-grid">
                <div class="csc-item">
                  <span class="csc-lbl">Compenso</span>
                  <span class="csc-val text-primary">${b.earnings.toFixed(2)} €</span>
                </div>
                <div class="csc-item">
                  <span class="csc-lbl">Ore lavorate</span>
                  <span class="csc-val">${b.hours.toFixed(1)} h</span>
                </div>
                <div class="csc-item">
                  <span class="csc-lbl">Pazienti fatti</span>
                  <span class="csc-val">${b.patients}</span>
                </div>
                <div class="csc-item">
                  <span class="csc-lbl">Turni</span>
                  <span class="csc-val">${b.shiftCount}</span>
                </div>
              </div>
              <div class="csc-progress-bar">
                <div class="csc-progress-fill" style="width: ${pct}%; background-color: ${b.clinic.color}"></div>
              </div>
              <div class="csc-pct">${pct}% del totale mensile</div>
            </div>
          `;
        }).join('');
      }
    }

    // Render Detailed Accounting Table
    const tableBody = document.getElementById('report-table-body');
    if (tableBody) {
      if (data.shifts.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-muted">Nessun turno registrato in questo mese.</td></tr>`;
      } else {
        tableBody.innerHTML = data.shifts.map(s => {
          const clinic = Storage.getClinic(s.clinicId) || { name: 'Studio', color: '#64748b' };
          const dateFormatted = new Date(s.date + 'T00:00:00').toLocaleDateString('it-IT', {
            weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
          });

          let paxText = '';
          let treatmentsDetail = '';

          if (s.mode === 'detailed' && s.patients) {
            const doneList = s.patients.filter(p => p.status === 'done');
            paxText = `<strong>${doneList.length} eseguiti</strong> / ${s.patients.length} tot`;
            // Summarize treatments
            const counts = {};
            doneList.forEach(p => {
              counts[p.treatment] = (counts[p.treatment] || 0) + 1;
            });
            treatmentsDetail = Object.entries(counts).map(([name, c]) => `${c}x ${name}`).join(', ');
          } else {
            paxText = `<strong>${s.quickDone} eseguiti</strong> su ${s.quickPlanned}`;
            if (s.quickCancelled > 0) paxText += ` (${s.quickCancelled} disdette)`;
          }

          const shiftTax = Storage.calculateTaxesAndNet(s.calculatedEarnings || 0, this.selectedTaxRegime, this.customTaxRate);

          return `
            <tr>
              <td><strong>${dateFormatted}</strong></td>
              <td>
                <span class="badge-clinic" style="background-color: ${clinic.color}15; color: ${clinic.color}; border: 1px solid ${clinic.color}40">
                  <span class="color-dot-sm" style="background-color: ${clinic.color}"></span>
                  ${this.escapeHtml(clinic.name)}
                </span>
              </td>
              <td>${s.startTime} - ${s.endTime} (${s.hoursWorked.toFixed(1)} h)</td>
              <td>
                <div>${paxText}</div>
                ${treatmentsDetail ? `<div class="sub-detail">${this.escapeHtml(treatmentsDetail)}</div>` : ''}
              </td>
              <td><span class="text-muted text-sm">${ClinicsModule.getCompDescription(clinic)}</span></td>
              <td class="text-right"><strong>${(s.calculatedEarnings || 0).toFixed(2)} €</strong></td>
              <td class="text-right">
                <strong class="text-success">${shiftTax.netAmount.toFixed(2)} €</strong>
                <div class="sub-detail" style="color: #b91c1c;">(-${shiftTax.totalReserve.toFixed(2)} € tasse)</div>
              </td>
              <td><span class="sub-detail">${this.escapeHtml(s.notes || '')}</span></td>
            </tr>
          `;
        }).join('');
      }
    }

    // Render Print Pro-Forma Document Preview
    this.renderPrintDocument(data, profile, totalEarnings, totalHours, totalPatientsDone);
  },

  renderPrintDocument(data, profile, totalEarnings, totalHours, totalPatientsDone) {
    const docContainer = document.getElementById('printable-invoice-document');
    if (!docContainer) return;

    const [year, month] = (this.currentMonth || '').split('-');
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    const formattedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const clinic = this.currentClinicId ? Storage.getClinic(this.currentClinicId) : null;

    let html = `
      <div class="print-doc-header">
        <div class="print-doc-hygienist">
          <h2 class="print-hygienist-name">${this.escapeHtml(profile.name || 'Dott.ssa Igienista Dentale')}</h2>
          <p class="print-hygienist-sub">${this.escapeHtml(profile.title || 'Igienista Dentale')}</p>
          ${profile.pIva ? `<p><strong>P.IVA:</strong> ${this.escapeHtml(profile.pIva)}</p>` : ''}
          ${profile.codFiscale ? `<p><strong>C.F.:</strong> ${this.escapeHtml(profile.codFiscale)}</p>` : ''}
          ${profile.phone ? `<p><strong>Tel:</strong> ${this.escapeHtml(profile.phone)}</p>` : ''}
          ${profile.email ? `<p><strong>Email:</strong> ${this.escapeHtml(profile.email)}</p>` : ''}
          ${profile.iban ? `<p><strong>IBAN:</strong> ${this.escapeHtml(profile.iban)}</p>` : ''}
        </div>
        <div class="print-doc-recipient">
          <p class="print-lbl">SPETT.LE:</p>
          <h3 class="print-clinic-name">${clinic ? this.escapeHtml(clinic.name) : 'Riepilogo Generale Studi'}</h3>
          ${clinic && clinic.doctor ? `<p>All'attenzione di: ${this.escapeHtml(clinic.doctor)}</p>` : ''}
          ${clinic && clinic.address ? `<p>${this.escapeHtml(clinic.address)}</p>` : ''}
          ${clinic && clinic.phone ? `<p>Tel: ${this.escapeHtml(clinic.phone)}</p>` : ''}
          <div class="print-date-badge">
            Data rendiconto: ${new Date().toLocaleDateString('it-IT')}
          </div>
        </div>
      </div>

      <div class="print-doc-title">
        RENDICONTO PRESTAZIONI E COMPENSI &ndash; ${formattedMonth.toUpperCase()}
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Studio</th>
            <th>Orario</th>
            <th>Ore Nette</th>
            <th>Pazienti Fatti</th>
            <th class="text-right">Compenso Spettante</th>
          </tr>
        </thead>
        <tbody>
          ${data.shifts.map(s => {
            const cl = Storage.getClinic(s.clinicId) || { name: 'Studio' };
            const paxDone = s.mode === 'detailed' && s.patients
              ? s.patients.filter(p => p.status === 'done').length
              : (s.quickDone || 0);

            return `
              <tr>
                <td>${new Date(s.date + 'T00:00:00').toLocaleDateString('it-IT')}</td>
                <td>${this.escapeHtml(cl.name)}</td>
                <td>${s.startTime} - ${s.endTime}</td>
                <td>${s.hoursWorked.toFixed(2)} h</td>
                <td>${paxDone}</td>
                <td class="text-right">${(s.calculatedEarnings || 0).toFixed(2)} €</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="print-total-row">
            <td colspan="3"><strong>TOTALI DEL PERIODO</strong></td>
            <td><strong>${totalHours.toFixed(2)} h</strong></td>
            <td><strong>${totalPatientsDone} pax</strong></td>
            <td class="text-right"><strong class="print-big-total">${totalEarnings.toFixed(2)} €</strong></td>
          </tr>
        </tfoot>
      </table>

      <div class="print-footer-notes">
        <p><em>Il presente prospetto costituisce riepilogo analitico delle prestazioni svolte nel mese per l'emissione della relativa fattura professionale.</em></p>
        <div class="print-signatures">
          <div class="print-sig-col">
            <p>Firma Igienista Dentale</p>
            <div class="sig-line"></div>
          </div>
          <div class="print-sig-col">
            <p>Firma per accettazione Studio</p>
            <div class="sig-line"></div>
          </div>
        </div>
      </div>
    `;

    docContainer.innerHTML = html;
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }
};
