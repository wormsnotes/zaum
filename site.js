"use strict";

(() => {
  document.querySelectorAll("[data-year]").forEach(element => {
    element.textContent = new Date().getFullYear();
  });

  const filters = document.querySelector(".news-filters");
  if (!filters) return;

  const buttons = [...filters.querySelectorAll("[data-topic]")];
  const articles = [...document.querySelectorAll("[data-article-topic]")];
  const titles = { all: "Все материалы", city: "Город", culture: "Культура", science: "Наука" };
  const count = document.querySelector("#news-count");
  const heading = document.querySelector("#feed-title");
  const empty = document.querySelector("#news-empty");

  function applyTopic(topic, updateUrl) {
    if (!Object.hasOwn(titles, topic)) topic = "all";
    let visible = 0;
    articles.forEach(article => {
      article.hidden = topic !== "all" && article.dataset.articleTopic !== topic;
      if (!article.hidden) visible++;
    });
    buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.topic === topic)));
    heading.textContent = titles[topic];
    count.textContent = `Материалов: ${visible}`;
    empty.hidden = visible > 0;

    if (updateUrl) {
      const url = new URL(location.href);
      if (topic === "all") url.searchParams.delete("topic");
      else url.searchParams.set("topic", topic);
      const selected = getLinkedArticle();
      if (selected && selected.hidden) url.hash = "";
      // Фильтры работают и при открытии HTML с компьютера, где History API может быть ограничен.
      try { history.pushState(null, "", url); } catch (_) { /* Не мешает фильтрации. */ }
    }
  }

  function getLinkedArticle() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return null; }
    return articles.find(article => article.id === id) || null;
  }

  function restoreLocation() {
    const article = getLinkedArticle();
    const topic = new URL(location.href).searchParams.get("topic") || "all";
    applyTopic(article && topic !== "all" && topic !== article.dataset.articleTopic ? article.dataset.articleTopic : topic, false);
    if (article) {
      article.open = true;
      requestAnimationFrame(() => article.scrollIntoView({ block: "start" }));
    }
  }

  buttons.forEach(button => {
    const total = articles.filter(article => button.dataset.topic === "all" || article.dataset.articleTopic === button.dataset.topic).length;
    button.querySelector("span").textContent = total;
    button.addEventListener("click", () => applyTopic(button.dataset.topic, true));
  });
  articles.forEach(article => {
    article.addEventListener("toggle", () => {
      article.querySelector(".article-toggle").firstChild.textContent = article.open ? "Свернуть материал " : "Читать материал ";
    });
  });
  window.addEventListener("popstate", restoreLocation);
  window.addEventListener("hashchange", restoreLocation);
  filters.hidden = false;
  restoreLocation();
})();
