async function carregarArquivo(nome) {
  const resposta = await fetch(`data/${nome}`);
  const texto = await resposta.text();
  return texto.split("\n").filter(l => l.trim() !== "");
}

async function gerarHorario() {
  const professores = await carregarArquivo("professores.txt");
  const materias = await carregarArquivo("materias.txt");
  const turmas = await carregarArquivo("turmas.txt");
  const horarios = await carregarArquivo("horarios.txt");

  let resultado = "<h2>Horários Gerados</h2>";

  turmas.forEach(turma => {
    const [nomeTurma, listaMaterias] = turma.split(";");
    resultado += `<h3>Turma ${nomeTurma}</h3><table><tr><th>Horário</th><th>Matéria</th><th>Professor</th></tr>`;
    
    listaMaterias.split(",").forEach((materia, i) => {
      const horario = horarios[i % horarios.length];
      const professor = professores.find(p => p.includes(materia))?.split(";")[0] || "N/D";
      resultado += `<tr><td>${horario}</td><td>${materia}</td><td>${professor}</td></tr>`;
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

// Exportar para Google Planilhas (gera CSV que pode ser importado)
function exportarGoogle() {
  const tabela = document.querySelector("table");
  const ws = XLSX.utils.table_to_sheet(tabela);
  const csv = XLSX.utils.sheet_to_csv(ws);

  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "horarios.csv";
  link.click();

  alert("Arquivo CSV gerado! Faça upload no Google Planilhas.");
}
