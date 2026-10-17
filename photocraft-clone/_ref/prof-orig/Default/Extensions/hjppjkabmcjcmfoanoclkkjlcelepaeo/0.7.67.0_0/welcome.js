function setStats(statData, techData) {
  localStorage['userAcceptedTerms'] = true;
  localStorage['agreeWithProcessingStatisticalData'] = statData;
  localStorage['agreeWithProcessingTechnicalData'] = techData;
  window.close();
}

function statsDisable() {
  setStats(false, false);
}
function statsEnableTech() {
  setStats(false, true);
}
function statsEnableAll() {
  setStats(true, true);
}

window.addEventListener("load", (event) => {
  document.getElementById("statsDisable").addEventListener("click", statsDisable);
  document.getElementById("statsEnableTech").addEventListener("click", statsEnableTech);
  document.getElementById("statsEnableAll").addEventListener("click", statsEnableAll);
});
