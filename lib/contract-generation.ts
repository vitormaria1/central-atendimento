function normalizeText(text: string) {
  return (text ?? "").replace(/\r\n/g, "\n").trim();
}

function inferServiceDescription(prompt: string) {
  const p = normalizeText(prompt).toLowerCase();
  if (p.includes("desenvolvimento de software")) {
    return "desenvolvimento de software, incluindo análise, implementação, ajustes, manutenção corretiva e evolutiva, conforme solicitações da CONTRATANTE";
  }
  if (p.includes("software")) {
    return "desenvolvimento de soluções de software, incluindo análise, implementação, ajustes, manutenção corretiva e evolutiva, conforme solicitações da CONTRATANTE";
  }
  return "prestação de serviços especializados descritos neste instrumento, conforme solicitações da CONTRATANTE";
}

function buildPartyBlock(label: string) {
  return [
    `${label}:`,
    "Razão social: [NOME DA EMPRESA]",
    "CNPJ: [CNPJ]",
    "Endereço: [ENDEREÇO COMPLETO]",
    "Representante legal: [NOME DO REPRESENTANTE]",
    "CPF: [CPF]",
    "E-mail: [E-MAIL]",
    "Telefone: [TELEFONE]",
  ].join("\n");
}

export function shouldUseServiceContractFlow(prompt: string) {
  const p = normalizeText(prompt).toLowerCase();
  const looksLikeContract = p.includes("contrato") || p.includes("prestação de serviços") || p.includes("prestacao de servicos");
  const wantsPdf = p.includes("pdf") || p.includes("arquivo") || p.includes("modelo");
  return looksLikeContract && wantsPdf;
}

export function buildServiceContractDraft(prompt: string) {
  const serviceDescription = inferServiceDescription(prompt);

  const lines = [
    "CONTRATO DE PRESTAÇÃO DE SERVIÇOS",
    "DE DESENVOLVIMENTO DE SOFTWARE",
    "",
    "Pelo presente instrumento particular, as partes abaixo identificadas celebram o presente Contrato de Prestação de Serviços, que se regerá pelas cláusulas e condições seguintes:",
    "",
    "1. PARTES",
    buildPartyBlock("CONTRATANTE"),
    "",
    buildPartyBlock("CONTRATADA"),
    "",
    "2. OBJETO",
    `2.1. O presente contrato tem por objeto a prestação, pela CONTRATADA, de ${serviceDescription}.`,
    "2.2. O escopo detalhado, cronograma, entregas e eventuais marcos adicionais serão definidos entre as partes por escrito, inclusive por e-mail ou documento anexo.",
    "",
    "3. OBRIGAÇÕES DA CONTRATADA",
    "3.1. Executar os serviços com zelo, técnica e observância das melhores práticas aplicáveis.",
    "3.2. Manter a CONTRATANTE informada sobre o andamento das atividades e eventuais riscos identificados.",
    "3.3. Corrigir falhas diretamente relacionadas ao escopo contratado, dentro de prazo razoável a ser ajustado entre as partes.",
    "3.4. Guardar sigilo sobre informações, dados e documentos recebidos em razão deste contrato.",
    "",
    "4. OBRIGAÇÕES DA CONTRATANTE",
    "4.1. Fornecer à CONTRATADA as informações, acessos, materiais e aprovações necessários à execução dos serviços.",
    "4.2. Realizar os pagamentos nos prazos e condições acordados.",
    "4.3. Indicar interlocutor responsável para validação de entregas e alinhamentos operacionais.",
    "",
    "5. PRAZO",
    "5.1. O presente contrato terá início em [DATA DE INÍCIO] e vigorará por [PRAZO], podendo ser renovado ou prorrogado mediante acordo entre as partes.",
    "",
    "6. REMUNERAÇÃO",
    "6.1. Pelos serviços prestados, a CONTRATANTE pagará à CONTRATADA o valor de [VALOR], na forma e periodicidade abaixo:",
    "6.2. Forma de pagamento: [FORMA DE PAGAMENTO].",
    "6.3. Em caso de atraso, incidirão multa de [MULTA]% sobre o valor devido, além de juros de [JUROS]% ao mês e correção monetária, se aplicável.",
    "",
    "7. PROPRIEDADE INTELECTUAL",
    "7.1. O tratamento da propriedade intelectual sobre códigos, artefatos, documentos e demais entregáveis observará o que for expressamente ajustado entre as partes.",
    "7.2. Na ausência de disposição em contrário, os entregáveis produzidos especificamente sob demanda da CONTRATANTE poderão ser utilizados por esta após a quitação integral dos valores devidos.",
    "",
    "8. CONFIDENCIALIDADE",
    "8.1. As partes obrigam-se a manter sigilo sobre informações técnicas, comerciais e estratégicas compartilhadas em razão deste contrato.",
    "8.2. A obrigação de confidencialidade permanece válida mesmo após o encerramento da relação contratual.",
    "",
    "9. ACEITAÇÃO E ENTREGA",
    "9.1. As entregas serão consideradas aceitas após validação expressa da CONTRATANTE ou após decurso do prazo de manifestação acordado entre as partes.",
    "9.2. Eventuais ajustes solicitados fora do escopo inicial poderão ensejar alteração de prazo e/ou remuneração.",
    "",
    "10. RESCISÃO",
    "10.1. O contrato poderá ser rescindido por qualquer das partes mediante aviso prévio de [DIAS] dias, salvo hipóteses de rescisão imediata por descumprimento contratual.",
    "10.2. Na hipótese de rescisão, permanecem devidos os valores correspondentes aos serviços já executados.",
    "",
    "11. DISPOSIÇÕES GERAIS",
    "11.1. Este instrumento não gera vínculo empregatício entre as partes.",
    "11.2. Qualquer alteração de escopo, prazo ou valores deverá ser formalizada por escrito.",
    "11.3. A tolerância de uma parte para com a outra não implica novação ou renúncia de direitos.",
    "",
    "12. FORO",
    "12.1. Fica eleito o foro da comarca de [CIDADE/UF] para dirimir eventuais controvérsias decorrentes deste contrato.",
    "",
    "E, por estarem justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor.",
    "",
    "Local e data: [CIDADE/UF], [DATA]",
    "",
    "________________________________________",
    "CONTRATANTE",
    "",
    "________________________________________",
    "CONTRATADA",
    "",
    "TESTEMUNHAS:",
    "",
    "1. Nome: ________________________________ CPF: ________________________________",
    "2. Nome: ________________________________ CPF: ________________________________",
  ];

  const text = lines.join("\n");
  return {
    text,
    filename: "Contrato_Prestacao_Servicos_Desenvolvimento_Software_Modelo.pdf",
    responseText: "Segue o contrato em PDF.",
  };
}
