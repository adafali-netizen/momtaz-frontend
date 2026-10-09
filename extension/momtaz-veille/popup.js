chrome.storage.session.get("etat").then(({ etat }) => {
  document.getElementById("etat").textContent = etat || "En attente d'une tâche.";
});
