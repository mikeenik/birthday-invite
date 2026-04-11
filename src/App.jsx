import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import invitePhoto from "../IMG_4945.JPG";
import "./App.css";

const INVITE_DETAILS_MD = `**18 апреля (суббота) в 18:00**

Санкт-Петербург, Московский пр. 97  
*(вход слева от отеля "Московские Ворота")*

**Буду рада видеть тебя на празднике!**

Пожалуйста, подтверди свой визит ниже и заполни прочие пожелания.`;

function withCacheBuster(url) {
  const u = String(url).trim();
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}_=${Date.now()}`;
}

/** Убирает пробелы, переносы и невидимые символы (частая ошибка в GitHub Secret). */
function normalizeGoogleScriptUrl(url) {
  return String(url ?? "")
    .trim()
    .replace(/\u200B/g, "")
    .replace(/[\r\n]+/g, "");
}

/** Снимает префикс XSSI `)]}'` у ответов Google, если есть. */
function parseGoogleScriptJson(text) {
  let t = String(text).trim();
  if (t.startsWith(")]}'")) {
    const nl = t.indexOf("\n");
    t = nl >= 0 ? t.slice(nl + 1).trim() : "";
  }
  return JSON.parse(t);
}

/**
 * Загрузка списка с веб-приложения Google Apps Script.
 * Параллельно: GET (JSON) и JSONP — что сработает первым (на проде CORS часто рвёт fetch, JSONP может пройти).
 */
async function loadVotersFromGoogleScript(baseUrl) {
  const trimmed = normalizeGoogleScriptUrl(baseUrl);
  if (!trimmed) {
    throw new Error(
      "Пустой URL скрипта. Для GitHub Pages в репозитории нужен Secret VITE_GOOGLE_SCRIPT_URL и новый деплой.",
    );
  }
  if (/\/dev($|\?)/i.test(trimmed)) {
    throw new Error(
      "Используй URL деплоя с /exec, а не /dev (Deploy → Web app → скопируй ссылку на exec).",
    );
  }

  const urlBusted = withCacheBuster(trimmed);

  const tryFetchJson = async () => {
    const res = await fetch(urlBusted, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    try {
      return parseGoogleScriptJson(text);
    } catch {
      throw new Error(
        "Ответ не JSON (проверь doGet и новый деплой веб-приложения).",
      );
    }
  };

  let data;
  try {
    data = await Promise.any([tryFetchJson(), jsonpGoogleScript(urlBusted)]);
  } catch (e) {
    const hint =
      "Проверь: URL заканчивается на /exec; в GitHub → Settings → Secrets добавлен VITE_GOOGLE_SCRIPT_URL; в Apps Script заново разверни веб-приложение (доступ: все); отключи блокировку script.google.com для сайта.";
    if (e instanceof AggregateError) {
      throw new Error(`Список не загрузился (ни fetch, ни JSONP). ${hint}`);
    }
    throw e instanceof Error ? e : new Error(String(e));
  }

  if (!data || typeof data !== "object") {
    throw new Error("Пустой ответ сервера.");
  }

  // Иногда fetch отдаёт пустой rows; повтор только через JSONP
  if (data.ok && Array.isArray(data.rows) && data.rows.length === 0) {
    try {
      const viaJsonp = await jsonpGoogleScript(withCacheBuster(trimmed));
      if (
        viaJsonp &&
        viaJsonp.ok &&
        Array.isArray(viaJsonp.rows) &&
        viaJsonp.rows.length > 0
      ) {
        return viaJsonp;
      }
    } catch {
      // оставляем data
    }
  }

  return data;
}

function jsonpGoogleScript(url) {
  return new Promise((resolve, reject) => {
    const cb = `rsvpJsonp${Date.now()}${Math.floor(Math.random() * 1e9)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Таймаут JSONP: открой URL скрипта в браузере с ?callback=test — должен вернуться JS. Заново задеплой Apps Script с doGet.",
        ),
      );
    }, 25000);
    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };
    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${encodeURIComponent(cb)}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(
        new Error(
          "JSONP: скрипт не загрузился (URL /exec, блокировщики, деплой doGet, секрет VITE_GOOGLE_SCRIPT_URL).",
        ),
      );
    };
    (document.body || document.head).appendChild(script);
  });
}

function formatVoteLabel(row) {
  const o = String(row.outcome || "");
  const att = String(row.attendance || "");

  if (o === "declined_gag") return "Не смогу (шутка)";
  if (o === "maybe_tease_dont_gag") return "Сомнения → «не делать» (шутка)";
  if (o === "rsvp_yes_attending" || att === "yes") return "Приду";

  // maybe в таблице + rsvp_maybe_attending из формы — один текст, без «Приду (сомневался)»
  if (o === "rsvp_maybe_attending" || att === "maybe") {
    const u = row.maybeFollowUp;
    const n = u != null && u !== "" ? Number.parseInt(String(u).trim(), 10) : NaN;
    const suffix =
      !Number.isNaN(n) && n >= 0 && n <= 10 ? ` · ${n}/10` : "";
    return `Не уверен(а)${suffix}`;
  }

  if (att === "no") return "Не смогу";
  return o || "—";
}

function formatCreatedAt(value) {
  if (value == null || value === "") return "—";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

function formatDrinksCell(value) {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

const EMPTY_FORM = {
  guestName: "",
  attendance: "",
  drinks: [],
  comment: "",
  uncertaintyLevel: 0,
};

function App() {
  const googleScriptUrl = normalizeGoogleScriptUrl(
    import.meta.env.VITE_GOOGLE_SCRIPT_URL || "",
  );
  const [formData, setFormData] = useState(() => ({
    ...EMPTY_FORM,
    drinks: [],
  }));
  /** Данные последней успешной отправки (форма после неё сбрасывается) */
  const [lastSubmitInfo, setLastSubmitInfo] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [voters, setVoters] = useState(null);
  const [votersLoading, setVotersLoading] = useState(false);
  const [votersError, setVotersError] = useState("");

  const drinkOptions = [
    { id: "juice", label: "Сок/Лимонад" },
    { id: "gin", label: "Виски/Джин" },
    { id: "wine", label: "Вино/Игристое" },
    { id: "another", label: "Другое, напишу в комментарии" },
  ];

  const nameOk = formData.guestName.trim().length > 0;
  const showStep2 = nameOk;
  const showBlockDrinksAndComment =
    nameOk && formData.attendance === "yes";
  const showBlockUncertainty = nameOk && formData.attendance === "maybe";
  const showBlockDecline = nameOk && formData.attendance === "no";
  const showGagAfterSubmit =
    isSubmitted && lastSubmitInfo?.attendance === "no";

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setIsSubmitted(false);
  };

  const handleAttendanceChange = (event) => {
    const value = event.target.value;
    setFormData((prev) => ({
      ...prev,
      attendance: value,
      ...(value === "maybe"
        ? { drinks: [], comment: "" }
        : value === "yes"
          ? { uncertaintyLevel: 0 }
          : {}),
      ...(value === "no" ? { drinks: [], comment: "" } : {}),
    }));
    setIsSubmitted(false);
    setSubmitError("");
  };

  const handleDrinkToggle = (event) => {
    const { value, checked } = event.target;
    setFormData((prev) => ({
      ...prev,
      drinks: checked
        ? [...prev.drinks, value]
        : prev.drinks.filter((drink) => drink !== value),
    }));
  };

  const handleUncertaintyChange = (event) => {
    const value = Number(event.target.value);
    setFormData((prev) => ({
      ...prev,
      uncertaintyLevel: Number.isFinite(value) ? value : 0,
    }));
    setIsSubmitted(false);
  };

  async function submitRsvp(overrides = {}) {
    setSubmitError("");
    const payload = {
      ...formData,
      ...overrides,
      drinks:
        overrides.drinks !== undefined ? overrides.drinks : formData.drinks,
      comment:
        overrides.comment !== undefined ? overrides.comment : formData.comment,
      createdAt: new Date().toISOString(),
    };

    try {
      const existing = JSON.parse(
        localStorage.getItem("rsvpResponses") || "[]",
      );
      localStorage.setItem(
        "rsvpResponses",
        JSON.stringify([...existing, payload]),
      );
    } catch {
      // ignore
    }

    if (!googleScriptUrl) {
      setSubmitError(
        "Не задан VITE_GOOGLE_SCRIPT_URL. Для GitHub Pages добавь Repository secret: VITE_GOOGLE_SCRIPT_URL.",
      );
      return false;
    }

    setIsSubmitting(true);
    try {
      await fetch(googleScriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payload),
      });
      const att = String(payload.attendance || "");
      const uncertaintyForMessage =
        att === "maybe"
          ? Math.min(
              10,
              Math.max(
                0,
                Number.parseInt(String(payload.maybeFollowUp ?? "0"), 10) || 0,
              ),
            )
          : formData.uncertaintyLevel;
      setLastSubmitInfo({
        guestName: String(payload.guestName || "").trim(),
        attendance: att,
        uncertaintyLevel: uncertaintyForMessage,
      });
      setFormData({ ...EMPTY_FORM, drinks: [] });
      setIsSubmitted(true);
      return true;
    } catch {
      setSubmitError(
        "Не удалось отправить в Google Sheets. Попробуй еще раз.",
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (
      !showBlockDrinksAndComment &&
      !showBlockUncertainty &&
      !showBlockDecline
    ) {
      return;
    }
    if (!formData.guestName.trim()) {
      setSubmitError("Сначала введи имя.");
      return;
    }

    if (formData.attendance === "yes") {
      await submitRsvp({
        maybeFollowUp: "",
        outcome: "rsvp_yes_attending",
      });
      return;
    }

    if (formData.attendance === "maybe") {
      await submitRsvp({
        maybeFollowUp: String(formData.uncertaintyLevel),
        outcome: "rsvp_maybe_attending",
        drinks: [],
        comment: "",
      });
      return;
    }

    if (formData.attendance === "no") {
      await submitRsvp({
        attendance: "no",
        maybeFollowUp: "",
        outcome: "declined_gag",
        drinks: [],
        comment: "",
      });
    }
  };

  const fetchVoters = useCallback(async () => {
    if (!googleScriptUrl) {
      setVotersError("Нет URL скрипта.");
      return;
    }
    setVotersLoading(true);
    setVotersError("");
    try {
      const data = await loadVotersFromGoogleScript(googleScriptUrl);
      if (!data || !data.ok) {
        throw new Error(
          (data && data.error) || "Сервер вернул ошибку (ok: false)",
        );
      }
      setVoters(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      setVotersError(e instanceof Error ? e.message : "Ошибка загрузки");
      setVoters([]);
    } finally {
      setVotersLoading(false);
    }
  }, [googleScriptUrl]);

  useEffect(() => {
    if (!isSubmitted || !googleScriptUrl) return;
    const t = window.setTimeout(() => {
      void fetchVoters();
    }, 1800);
    return () => window.clearTimeout(t);
  }, [isSubmitted, googleScriptUrl, fetchVoters]);

  return (
    <main className="page">
      <section className="invite-card invite-card--title" aria-label="Заголовок">
        <h1 className="invite-title">
          <span className="invite-title__part invite-title__part--left">
            Lera's
          </span>
          <span className="invite-title__part invite-title__part--center">
            Birthday
          </span>
          <span className="invite-title__part invite-title__part--right">
            Party
          </span>
        </h1>
      </section>

      <section className="invite-card invite-card--details" aria-label="Детали встречи">
        <div className="invite-columns">
          <img
            className="invite-columns__photo"
            src={invitePhoto}
            alt=""
            width={640}
            height={640}
          />
          <div className="invite-columns__main invite-md">
            <ReactMarkdown>{INVITE_DETAILS_MD}</ReactMarkdown>
          </div>
        </div>
      </section>

      <section className="rsvp-card">
        <form onSubmit={handleSubmit}>
          <label htmlFor="guestName">Кто ты?</label>
          <input
            id="guestName"
            name="guestName"
            type="text"
            placeholder="Например: Владимир Путин"
            value={formData.guestName}
            onChange={handleInputChange}
            autoComplete="name"
          />

          {showStep2 && (
            <fieldset>
              <legend>Шо ты?</legend>
              <label className="radio-option">
                <input
                  type="radio"
                  name="attendance"
                  value="yes"
                  checked={formData.attendance === "yes"}
                  onChange={handleAttendanceChange}
                />
                Да, буду
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="attendance"
                  value="maybe"
                  checked={formData.attendance === "maybe"}
                  onChange={handleAttendanceChange}
                />
                Пока не уверен(а)
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="attendance"
                  value="no"
                  checked={formData.attendance === "no"}
                  onChange={handleAttendanceChange}
                />
                Не смогу
              </label>
            </fieldset>
          )}

          {showBlockDrinksAndComment && (
            <>
              <fieldset>
                <legend>Какие напитки предпочитаешь?</legend>
                <div className="checkbox-grid">
                  {drinkOptions.map((drink) => (
                    <label key={drink.id} className="checkbox-option">
                      <input
                        type="checkbox"
                        value={drink.label}
                        checked={formData.drinks.includes(drink.label)}
                        onChange={handleDrinkToggle}
                      />
                      {drink.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label htmlFor="comment">Комментарий по напиткам</label>
              <textarea
                id="comment"
                name="comment"
                rows="4"
                placeholder="Например: без сахара, без алкоголя и т.д."
                value={formData.comment}
                onChange={handleInputChange}
              />

              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Отправка..." : "Отправить ответ"}
              </button>
            </>
          )}

          {showBlockUncertainty && (
            <>
              <fieldset className="uncertainty-block">
                <legend>Степень неуверенности</legend>
                <div className="uncertainty-slider-stack">
                  <input
                    className="uncertainty-slider"
                    type="range"
                    name="uncertaintyLevel"
                    min={0}
                    max={10}
                    step={1}
                    value={formData.uncertaintyLevel}
                    onChange={handleUncertaintyChange}
                    aria-valuemin={0}
                    aria-valuemax={10}
                    aria-valuenow={formData.uncertaintyLevel}
                    aria-label="Степень неуверенности от 0 до 10"
                  />
                  <div className="uncertainty-slider-labels">
                    <span className="uncertainty-slider-labels__left">Не уверен что не уверен</span>
                    <span className="uncertainty-slider-labels__right">
                      Точно не уверен
                    </span>
                  </div>
                </div>
              </fieldset>

              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Отправка..." : "Отправить ответ"}
              </button>
            </>
          )}

          {showBlockDecline && (
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Отправка..." : "Отправить ответ"}
            </button>
          )}
        </form>

        {showGagAfterSubmit && (
          <div className="gag-block" aria-live="polite">
            <div className="fireworks" aria-hidden="true">
              <span className="fireworks__burst fireworks__burst--1" />
              <span className="fireworks__burst fireworks__burst--2" />
              <span className="fireworks__burst fireworks__burst--3" />
              <span className="fireworks__burst fireworks__burst--4" />
            </div>
            <p className="gag-block__you">You are</p>
            <p className="gag-block__gay rainbow-text gag-rainbow">VONYUCHKA</p>
          </div>
        )}

        {submitError && (
          <div className="error-message" role="alert">
            {submitError}
          </div>
        )}

        {isSubmitted && lastSubmitInfo && (
          <div className="success-message" role="status" aria-live="polite">
            {showGagAfterSubmit ? (
              <>
                Записано. Спасибо за честность, {lastSubmitInfo.guestName}!
                <br />
                (данные отправлены в таблицу)
              </>
            ) : (
              <>
                Спасибо, {lastSubmitInfo.guestName}! Ответ записан.
                <br />
                Статус:{" "}
                {lastSubmitInfo.attendance === "yes"
                  ? "приду"
                  : lastSubmitInfo.attendance === "maybe"
                    ? `неуверен. Степень неуверенности: ${lastSubmitInfo.uncertaintyLevel} из 10 (значение бегунка)`
                    : "не смогу"}
                .
              </>
            )}
          </div>
        )}
      </section>

      {isSubmitted && googleScriptUrl && (
        <section className="rsvp-card voters-card" aria-labelledby="voters-heading">
          <h2 id="voters-heading" className="voters-card__title">
            Кто отметился
          </h2>
          {votersLoading && (
            <p className="voters-card__loading">Загружаем ответы…</p>
          )}
          {votersError && (
            <div className="error-message" role="alert">
              {votersError}
            </div>
          )}
          {!votersLoading && voters && voters.length === 0 && !votersError && (
            <p className="voters-card__empty">Пока нет строк в таблице.</p>
          )}
          {!votersLoading && voters && voters.length > 0 && (
            <div className="voters-table-wrap">
              <table className="voters-table">
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Ответ</th>
                    <th>Напитки</th>
                    <th>Время</th>
                  </tr>
                </thead>
                <tbody>
                  {voters.map((row, idx) => (
                    <tr key={`${row.createdAt}-${row.guestName}-${idx}`}>
                      <td>{row.guestName || "—"}</td>
                      <td>{formatVoteLabel(row)}</td>
                      <td className="voters-table__drinks">
                        {formatDrinksCell(row.drinks)}
                      </td>
                      <td>{formatCreatedAt(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            type="button"
            className="button-secondary voters-card__refresh"
            onClick={() => void fetchVoters()}
            disabled={votersLoading}
          >
            {votersLoading ? "Обновление…" : "Обновить список"}
          </button>
        </section>
      )}
    </main>
  );
}

export default App;
