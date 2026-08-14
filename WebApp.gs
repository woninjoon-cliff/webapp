// =====================================================================
// WebApp.gs — 새 웹앱 진입점
// =====================================================================


function doGet() {
  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle('병원 통합관리 시스템')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// =====================================================================
// HTML 파일 include
// =====================================================================

function include(filename) {
  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();
}