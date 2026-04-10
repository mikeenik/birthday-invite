import { useState } from "react";
import "./App.css";

function App() {
  const googleScriptUrl = import.meta.env.VITE_GOOGLE_SCRIPT_URL || "";
  const [formData, setFormData] = useState({
    guestName: "",
    attendance: "yes",
    drinks: [],
    comment: "",
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const drinkOptions = [
    { id: 'water', label: 'Вода' },
    { id: 'juice', label: 'Сок' },
    { id: 'soda', label: 'Газировка' },
    { id: 'gin', label: 'Виски/Джин' },
    { id: 'wine', label: 'Вино/Игристое' },
    {id: 'another', label: 'Другое, напишу в комментарии' },
  ];

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setIsSubmitting(true);
    const payload = {
      ...formData,
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
      // If localStorage is unavailable, we still show success in UI.
    }

    if (!googleScriptUrl) {
      setIsSubmitting(false);
      setSubmitError(
        "Не задан VITE_GOOGLE_SCRIPT_URL. Для GitHub Pages добавь Repository secret: VITE_GOOGLE_SCRIPT_URL.",
      );
      return;
    }

    try {
      await fetch(googleScriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payload),
      });

      setIsSubmitted(true);
    } catch {
      setSubmitError("Не удалось отправить в Google Sheets. Попробуй еще раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page">
      <section className="notice-card" aria-label="Заметка">
        <p className="rainbow-text">
          Телеграм заблокировали, поэтому давайте так
        </p>
      </section>

      <section className="invite-card">
        <p className="eyebrow">Приглашение</p>
        <h1>Lera's Birthday Party</h1>
        <p className="details">
          Встречаемся 18 апреля (суббота) в 18:00
          <br />
          Санкт-Петербург, Московский пр. 97 (вход в лофт слева от отеля Московские Ворота) 
        </p>
        <p className="description">
          Буду рада видеть тебя на празднике!
          <br />
          Пожалуйста, подтверди свой визит ниже и заполни прочие пожелания.
        </p>
      </section>

      <section className="rsvp-card">
        <h2>Подтверждение участия</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="guestName">Твое имя</label>
          <input
            id="guestName"
            name="guestName"
            type="text"
            placeholder="Например, Владимир Путин"
            value={formData.guestName}
            onChange={handleInputChange}
            required
          />

          <fieldset>
            <legend>Сможешь прийти?</legend>
            <label className="radio-option">
              <input
                type="radio"
                name="attendance"
                value="yes"
                checked={formData.attendance === "yes"}
                onChange={handleInputChange}
              />
              Да, буду
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="attendance"
                value="maybe"
                checked={formData.attendance === "maybe"}
                onChange={handleInputChange}
              />
              Пока не уверен(а)
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="attendance"
                value="no"
                checked={formData.attendance === "no"}
                onChange={handleInputChange}
              />
              Не смогу
            </label>
          </fieldset>

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
        </form>

        {submitError && (
          <div className="error-message" role="alert">
            {submitError}
          </div>
        )}

        {isSubmitted && (
          <div className="success-message" role="status" aria-live="polite">
            Спасибо, {formData.guestName}! Ответ записан.
            <br />
            Статус:{" "}
            {formData.attendance === "yes"
              ? "приду"
              : formData.attendance === "maybe"
                ? "пока не уверен(а)"
                : "не смогу"}
            .
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
