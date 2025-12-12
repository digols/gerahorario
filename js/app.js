let professores = [];
let materias = [];
let turmas = [];
let horarios = ["07:00-07:50","07:50-08:40","08:40-09:30","Intervalo","09:50-10:40","10:40-11:30"];

function cadastrarProfessor() {
  const nome = document.getElementById("nomeProfessor").value;
  const mats = document.getElementById("materiasProfessor").value.split(",");
  professores.push({nome, materias: mats});
  alert("Professor cadastrado!");
}

function cadastrarMateria() {
  const nome = document.getElementById("nomeMateria").value;
  const aulas = parseInt(document.getElementById("aulasMateria").value);
  materias.push({nome, aulas});
  alert("Matéria cadastrada!");
}

function cadastrarTurma() {
  const nome = document.getElementById("nomeTurma").value;
  const mats = document.getElementById("materiasTurma").value.split(",");
  turmas.push({nome, materias: mats});
  alert("Turma cadastrada!");
}

function gerarHorario() {
  let resultado = "<h2>Horários Gerados</h2>";
  let agendaProfessores = {}; // controle de conflitos

  turmas.forEach(turma => {
    resultado += `<h3>Turma ${turma.nome}</h3><table><tr><th>Horário</th><th>Matéria</th><th>Professor</th></tr>`;
    
    turma.materias.forEach((materia, i) => {
      const horario = horarios[i % horarios.length];
      const professor = professores.find(p => p.materias.includes(materia));
      
      // valida conflito
      if (agendaProfessores[horario] && agendaProfessores[horario].includes(professor?.nome)) {
        resultado += `<tr><td>${horario}</td><td>${materia}</td><td style="color:red">CONFLITO!</td></tr>`;
      } else {
        resultado += `<tr><td>${horario}</td><td>${materia}</td><td>${professor?.nome || "N/D"}</td></tr>`;
        if (!agendaProfessores[horario]) agendaProfessores[horario] = [];
        agendaProfessores[horario].push(professor?.nome);
      }
    });
    
    resultado += "</table>";
  });

  document.getElementById("resultado").innerHTML = resultado;
}

// Exportar para Excel
function exportarExcel() {
  const tabela = document.querySelectorAll("table");
  const wb = XLSX.utils.book_new();

  tabela.forEach((tbl, idx) => {
    const ws = XLSX.utils.table_to_sheet(tbl);
    XLSX.utils.book_append_sheet(wb, ws, `Turma${idx+1}`);
  });

  XLSX.writeFile(wb, "horarios.xlsx");
}

// Exportar para Google Sheets via API
async function exportarGoogle() {
  // Exemplo usando Google Sheets API
  // 1. Criar projeto no Google Cloud
  // 2. Ativar Google Sheets API
  // 3. Criar credenciais OAuth2
  // 4. Obter token de acesso

  const tabela = document.querySelector("table");
  const ws = XLSX.utils.table_to_sheet(tabela);
  const dados = XLSX.utils.sheet_to_json(ws, {header:1});

  // Exemplo de envio (precisa de token válido)
  const spreadsheetId = "SEU_ID_DA_PLANILHA";
  const range = "Página1!A1";
  const body = { values: dados };

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    headers: {
      "Authorization": "Bearer SEU_TOKEN_OAUTH",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  alert("Dados enviados para Google Planilhas!");
}
