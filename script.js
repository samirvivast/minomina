/* 
   Calculadora de nómina - Creada por Samir Vivas - 2025
   Contacto: bryansamir@gmail.com
*/

(() => {
  // --- Configurables / constantes (actualizables) ---
  const HEALTH_RATE = 0.04;     // Pago aporte a Salud 4% trabajador
  const PENSION_RATE = 0.04;    // Pago aporte Pension 4% trabajador
  const CESANTIAS_INTEREST_ANNUAL = 0.12; // 12% anual
  // Valores 2025 (puedes actualizar manualmente si cambian):
  const AUXILIO_TRANSPORTE_2025 = 200000;
  const SMMLV = 1423500; // salario minimo sin auxilio (valor 2025)
  const DAYS_IN_YEAR_LEGAL = 360; // para cálculos proporcionales en CST

  // --- utilidades ---
  const $ = id => document.getElementById(id);
  const format = n => {
    return Number(n || 0).toLocaleString('es-CO', {minimumFractionDigits:0, maximumFractionDigits:0});
  };

  function parseDateInput(val){
    if(!val) return null;
    const d = new Date(val + 'T00:00:00');
    return isNaN(d) ? null : d;
  }

  // calcula diferencia en días incluyendo ambos extremos (opcional)
  function daysBetween(d1, d2){
    const msPerDay = 24*60*60*1000;
    const t1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const t2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
    const diff = Math.round((t2 - t1) / msPerDay) + 1; // +1 para incluir ambos días
    return Math.max(0, diff);
  }

  // --- fórmulas según legislación aplicada ---
  function calcularPrima(salario, diasTrabajados){
    // Prima semestral: (salario * diasTrabajados) / 360
    return (salario * diasTrabajados) / DAYS_IN_YEAR_LEGAL;
  }

  function calcularCesantias(salario, diasTrabajados){
    // Cesantías: salario * diasTrabajados / 360
    return (salario * diasTrabajados) / DAYS_IN_YEAR_LEGAL;
  }

  function calcularInteresCesantias(cesantias, diasTrabajados){
    // Intereses: cesantías * 12% * diasTrabajados/360
    return cesantias * (CESANTIAS_INTEREST_ANNUAL * (diasTrabajados / DAYS_IN_YEAR_LEGAL));
  }

  function calcularVacaciones(salario, diasTrabajados){
    // Vacaciones (proporcional): salario * diasTrabajados / 720
    // (equivale a 15 días por año -> factor 15/360 = 1/24 -> salario/24 por año -> por días = salario * dias/720)
    return (salario * diasTrabajados) / (DAYS_IN_YEAR_LEGAL * 2);
  }

  function aplicaAuxilioTransporte(salario, transportOpt){
    // transportOpt: "auto" | "yes" | "no"
    if(transportOpt === 'yes') return true;
    if(transportOpt === 'no') return false;
    // auto: aplica hasta 2 SMMLV
    return salario <= (SMMLV * 2);
  }

  // --- DOM y eventos ---
  const form = $('payForm');
  const resultsSection = $('results');
  const resultsTableBody = $('resultsTable').querySelector('tbody');
  const summaryDiv = $('summary');

  form.addEventListener('submit', e => {
    e.preventDefault();
    calcular();
  });

  $('clearBtn').addEventListener('click', () => {
    form.reset();
    resultsSection.classList.add('hidden');
    resultsTableBody.innerHTML = '';
    summaryDiv.innerHTML = '';
  });

  $('exportPdf').addEventListener('click', () => {
    // Abrimos una nueva ventana con solo la tabla y disparamos print
    const company = $('companyName').value || '';
    const w = window.open('', '_blank');
    const styles = `
      <style>
        body{font-family: Arial, sans-serif; padding:18px; color:#111}
        h2{margin:0 0 8px}
        table{width:100%; border-collapse:collapse}
        th,td{padding:8px; border:1px solid #ddd; text-align:left}
      </style>
    `;
    w.document.write(`<html><head><title>Liquidación - ${company}</title>${styles}</head><body>`);
    w.document.write(document.querySelector('#results').innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.focus();
    // dejar al usuario imprimir (navegador mostrará diálogo)
    w.print();
  });

  $('downloadJson').addEventListener('click', () => {
    if(!window.lastLiquidacion) return alert('No hay nada para descargar. Primero calcule.');
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.lastLiquidacion, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', `liquidacion_${(window.lastLiquidacion.employeeName||'empleado').replace(/\s+/g,'_')}.json`);
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
  });

  // función principal
  function calcular(){
    const companyName = $('companyName').value || '';
    const companyNIT = $('companyNIT').value || '';
    const employeeName = $('employeeName').value || '';
    const employeeID = $('employeeID').value || '';
    const salary = Number($('salary').value) || 0;
    const dateStart = parseDateInput($('dateStart').value);
    const dateEnd = parseDateInput($('dateEnd').value);

    if(!dateStart || !dateEnd || dateEnd < dateStart) return alert('Verifica las fechas (fecha final debe ser >= fecha de ingreso).');

    // calcular días trabajados (se usan 360 días para proporcionales)
    const diasTranscurridos = daysBetween(dateStart, dateEnd);
    // pero para proporcionalidad legal se usan días naturales; sin embargo la fórmula usa dias trabajados (hasta 360 en semestre etc).
    // En la app asumimos diasTranscurridos como días efectivamente trabajados.
    const diasTrabajados = diasTranscurridos;

    // descuentos del trabajador
    const descuentoSalud = salary * HEALTH_RATE;
    const descuentoPension = salary * PENSION_RATE;

    // auxilio transporte (si aplica): se paga completo o proporcional (según días trabajados y si aplica)
    const transportOpt = $('transportEligibility').value;
    const auxAplica = aplicaAuxilioTransporte(salary, transportOpt);
    // si se aplica, se prorratea según dias trabajados sobre 30 días del mes:
    // asumimos proporcional mensual: auxilio * (diasTrabajados / 30) para cálculo mensual/pago parcial.
    // Para liquidaciones de periodos largos (ej: años) el auxilio se prorratea por mes/días...
    const auxilioMensual = auxAplica ? AUXILIO_TRANSPORTE_2025 : 0;
    // Para cálculo de proporción usamos factor sobre 30 días:
    const auxilioProporcional = auxilioMensual * (Math.min(diasTrabajados, 30) / 30);

    // prestaciones y provisiones
    // Prima: para un período dado (ej: semestre) la fórmula básica usada: salario * diasTrabajados / 360
    const prima = calcularPrima(salary, diasTrabajados);
    const cesantias = calcularCesantias(salary, diasTrabajados);
    const interesCesantias = calcularInteresCesantias(cesantias, diasTrabajados);
    const vacaciones = calcularVacaciones(salary, diasTrabajados);

    // Total devengado y deducciones (sencillo)
    const totalDescuentos = descuentoSalud + descuentoPension;
    const totalDevengado = salary + auxilioProporcional;
    // total prestaciones a cargo del empleador (provisión que debe pagar): cesantias + interes + prima + vacaciones
    const totalPrestaciones = cesantias + interesCesantias + prima + vacaciones;
    //Pago total al empleado
    const totalPago = totalDevengado - totalDescuentos;

    // Resultado: armar filas
    const rows = [
      ['Sueldo mensual', salary],
      ['Auxilio de transporte (proporcional calculado)', Math.round(auxilioProporcional)],
      ['Total devengado (sueldo + auxilio proporcional)', Math.round(totalDevengado)],
      ['--- Deducciones trabajador ---', 0],
      ['Descuento Salud (4%)', Math.round(descuentoSalud)],
      ['Descuento Pensión (4%)', Math.round(descuentoPension)],
      ['Total deducciones', Math.round(totalDescuentos)],
      ['--- Prestaciones y provisiones ---', 0],
      ['Prima proporcional (según días)', Math.round(prima)],
      ['Cesantías (proporcional)', Math.round(cesantias)],
      ['Intereses sobre cesantías (12% anual proporcional)', Math.round(interesCesantias)],
      ['Vacaciones proporcionales', Math.round(vacaciones)],
      ['Total prestaciones (provisión)', Math.round(totalPrestaciones)],
      ['_______________________________________________', 0],
      ['Total a Pagar:', totalPago]
    ];

    // renderizar en tabla
    resultsTableBody.innerHTML = '';
    rows.forEach(([concept, val]) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = concept;
      const td2 = document.createElement('td');
      td2.textContent = val ? format(Math.round(val)) : '';
      tr.appendChild(td1);
      tr.appendChild(td2);
      resultsTableBody.appendChild(tr);
    });

    // resumen
    summaryDiv.innerHTML = `
      <strong>Empleado:</strong> ${employeeName} (C.C. ${employeeID})<br/>
      <strong>Periodo:</strong> ${dateStart.toLocaleDateString()} - ${dateEnd.toLocaleDateString()} (${diasTrabajados} días)<br/>
      <strong>Total devengado:</strong> ${format(Math.round(totalDevengado))} COP — <strong>Total deducciones:</strong> ${format(Math.round(totalDescuentos))} COP
    `;

    resultsSection.classList.remove('hidden');

    // guardar resultado para descargar
    window.lastLiquidacion = {
      generatedAt: new Date().toISOString(),
      companyName, companyNIT, employeeName, employeeID,
      dateStart: dateStart.toISOString().slice(0,10),
      dateEnd: dateEnd.toISOString().slice(0,10),
      days: diasTrabajados,
      salary, auxilioProporcional, descuentoSalud, descuentoPension,
      prima, cesantias, interesCesantias, vacaciones,
      totalDevengado, totalDescuentos, totalPrestaciones
    };
  }

})();
