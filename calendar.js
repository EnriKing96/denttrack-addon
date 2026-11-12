/**
 * Interactive Calendar Module
 * Provides a clean month grid with clinic-colored badges, shift indicators,
 * day details modal and navigation.
 */

const CalendarModule = {
  currentDate: new Date(),
  selectedFilterClinicId: '',

  init() {
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    const btnPrev = document.getElementById('cal-btn-prev');
    const btnNext = document.getElementById('cal-btn-next');
    const btnToday = document.getElementById('cal-btn-today');
    const clinicFilter = document.getElementById('cal-filter-clinic');

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.render();
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.render();
      });
    }

    if (btnToday) {
      btnToday.addEventListener('click', () => {
        this.currentDate = new Date();
        this.render();
      });
    }

    if (clinicFilter) {
      clinicFilter.addEventListener('change', (e) => {
        this.selectedFilterClinicId = e.target.value;
        this.render();
      });
    }
  },

  updateClinicFilterDropdown() {
    const filter = document.getElementById('cal-filter-clinic');
    if (!filter) return;
    const clinics = Storage.getClinics();
    filter.innerHTML = `<option value="">Tutti gli studi</option>` +
      clinics.map(c => `<option value="${c.id}" ${this.selectedFilterClinicId === c.id ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>`).join('');
  },

  render() {
    this.updateClinicFilterDropdown();

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const titleEl = document.getElementById('cal-month-title');
    if (titleEl) {
      const monthName = new Date(year, month, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      titleEl.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    }

    const grid = document.getElementById('cal-grid');
    if (!grid) return;

    // Get all shifts
    let shifts = Storage.getShifts();
    if (this.selectedFilterClinicId) {
      shifts = shifts.filter(s => s.clinicId === this.selectedFilterClinicId);
    }

    // Map shifts by date 'YYYY-MM-DD'
    const shiftsByDate = {};
    shifts.forEach(s => {
      if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
      shiftsByDate[s.date].push(s);
    });

    // Calendar arithmetic
    // In it-IT, Monday is day 0 in our logic
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    let startingDayOfWeek = firstDayOfMonth.getDay() - 1; // 0 for Monday, 6 for Sunday
    if (startingDayOfWeek < 0) startingDayOfWeek = 6;

    const todayStr = new Date().toISOString().slice(0, 10);
    const pad = (n) => String(n).padStart(2, '0');

    let html = '';

    // Day of week headers
    const dayHeaders = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    html += '<div class="cal-weekdays-row">';
    dayHeaders.forEach(dh => {
      html += `<div class="cal-weekday-head">${dh}</div>`;
    });
    html += '</div>';

    html += '<div class="cal-days-grid">';

    // Previous month padding days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = 0; i < startingDayOfWeek; i++) {
      const dayNum = prevMonthLastDay - startingDayOfWeek + i + 1;
      html += `
        <div class="cal-day cal-day-other-month">
          <span class="day-number">${dayNum}</span>
        </div>
      `;
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
      const isToday = dateStr === todayStr;
      const dayShifts = shiftsByDate[dateStr] || [];

      let shiftsHtml = '';
      let dayTotalEarnings = 0;
      let dayTotalPatients = 0;

      dayShifts.forEach(shift => {
        const clinic = Storage.getClinic(shift.clinicId) || { name: 'Studio', color: '#0284c7' };
        const paxCount = shift.mode === 'detailed' && shift.patients
          ? shift.patients.filter(p => p.status === 'done').length
          : (shift.quickDone || 0);

        dayTotalEarnings += (shift.calculatedEarnings || 0);
        dayTotalPatients += paxCount;

        shiftsHtml += `
          <div class="cal-shift-pill" style="border-left: 3px solid ${clinic.color}; background-color: ${clinic.color}15" onclick="event.stopPropagation(); ShiftsModule.openModal('${shift.id}')">
            <span class="shift-time">${shift.startTime}-${shift.endTime}</span>
            <span class="shift-clinic-name">${this.escapeHtml(clinic.name)}</span>
            <div class="shift-mini-meta">
              <span>🦷 ${paxCount} pz</span>
              <span>💶 ${shift.calculatedEarnings ? Math.round(shift.calculatedEarnings) + '€' : ''}</span>
            </div>
          </div>
        `;
      });

      html += `
        <div class="cal-day ${isToday ? 'cal-day-today' : ''} ${dayShifts.length > 0 ? 'has-shifts' : ''}" onclick="CalendarModule.onDayClick('${dateStr}')">
          <div class="cal-day-top">
            <span class="day-number ${isToday ? 'today-badge' : ''}">${day}</span>
            ${dayShifts.length > 0 ? `<span class="day-summary-badge" title="Pazienti totali">🦷 ${dayTotalPatients}</span>` : ''}
          </div>
          <div class="cal-day-shifts">
            ${shiftsHtml}
          </div>
          <button class="cal-add-shift-btn" title="Aggiungi turno in questa data" onclick="event.stopPropagation(); ShiftsModule.openModal(null, '${dateStr}')">
            +
          </button>
        </div>
      `;
    }

    // Next month padding days to complete grid (multiples of 7)
    const totalRenderedCells = startingDayOfWeek + totalDays;
    const remainingCells = (7 - (totalRenderedCells % 7)) % 7;
    for (let day = 1; day <= remainingCells; day++) {
      html += `
        <div class="cal-day cal-day-other-month">
          <span class="day-number">${day}</span>
        </div>
      `;
    }

    html += '</div>';
    grid.innerHTML = html;
  },

  onDayClick(dateStr) {
    const shifts = Storage.getShifts().filter(s => s.date === dateStr);
    if (shifts.length === 0) {
      // Direct create shift on empty day
      ShiftsModule.openModal(null, dateStr);
    } else if (shifts.length === 1) {
      // Edit the shift
      ShiftsModule.openModal(shifts[0].id);
    } else {
      // Show mini selector if multiple shifts
      const options = shifts.map((s, idx) => {
        const c = Storage.getClinic(s.clinicId) || { name: 'Studio' };
        return `${idx + 1}. ${c.name} (${s.startTime} - ${s.endTime})`;
      }).join('\n');
      const choice = prompt(`Seleziona il turno da modificare (1-${shifts.length}) o premi Annulla per crearne uno nuovo:\n${options}`);
      if (choice && shifts[parseInt(choice) - 1]) {
        ShiftsModule.openModal(shifts[parseInt(choice) - 1].id);
      } else if (choice !== null) {
        ShiftsModule.openModal(null, dateStr);
      }
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }
};
