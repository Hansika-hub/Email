// Sidebar toggle
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}

const BACKEND_URL = "https://email-backend-bu9l.onrender.com";
let accessToken = null;

// Handle login success
function handleCredentialResponse(response) {
  const jwt = response.credential;
  console.log("JWT received:", jwt);

  fetch(`${BACKEND_URL}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: jwt }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Token verification failed");
      return res.json();
    })
    .then((data) => {
      accessToken = data.accessToken;
      fetchEmails();
    })
    .catch((err) => {
      console.error("Login error:", err);
      const errBox = document.getElementById("email-error");
      errBox.style.display = "block";
      errBox.textContent = "Login failed. Try again.";
    });
}

// Fetch Emails from backend
async function fetchEmails() {
  const emailList = document.getElementById("email-list");
  const emailLoading = document.getElementById("email-loading");
  const emailError = document.getElementById("email-error");

  emailLoading.style.display = "block";
  emailError.style.display = "none";

  try {
    const res = await fetch(`${BACKEND_URL}/fetch_emails`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) throw new Error("Email fetch failed");

    const emails = await res.json();
    emailList.innerHTML = "";

    emails.forEach((email) => {
      const div = document.createElement("div");
      div.className = "email-item";
      div.textContent = email.subject || "No Subject";
      div.addEventListener("click", () => fetchEvents(email.id));
      emailList.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    emailError.style.display = "block";
    emailError.textContent = "Failed to fetch emails.";
  } finally {
    emailLoading.style.display = "none";
  }
}

// Process single email and extract events
async function fetchEvents(emailId) {
  const eventsList = document.getElementById("events-list");
  const eventsLoading = document.getElementById("events-loading");
  const eventsError = document.getElementById("events-error");

  eventsLoading.style.display = "block";
  eventsError.style.display = "none";

  try {
    const res = await fetch(`${BACKEND_URL}/process_emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ emailId }),
    });

    if (!res.ok) throw new Error("Event extraction failed");

    const events = await res.json();
    eventsList.innerHTML = "";

    events.forEach((event) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div style="color: #8b5cf6; font-weight: bold;">${event.type || 'Event'}</div>
        <h2>${event.event_name || 'No Title'}</h2>
        <p>📅 ${event.date || 'N/A'}</p>
        <p>⏰ ${event.time || 'N/A'}</p>
        <p>📍 ${event.venue || 'N/A'}</p>
        <p>👥 ${event.attendees || 0} attendees</p>
      `;
      eventsList.appendChild(card);
    });

    updateSummary(events);
  } catch (err) {
    console.error(err);
    eventsError.style.display = "block";
    eventsError.textContent = "No events found for this email.";
  } finally {
    eventsLoading.style.display = "none";
  }
}

function updateSummary(events) {
  const total = events.length;
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const thisWeek = events.filter((ev) => {
    const dt = new Date(ev.date);
    return dt >= weekStart && dt <= weekEnd;
  }).length;

  const attendees = events.reduce((sum, ev) => sum + (parseInt(ev.attendees) || 0), 0);

  document.getElementById("total-events").textContent = total;
  document.getElementById("this-week-events").textContent = thisWeek;
  document.getElementById("total-attendees").textContent = attendees;
  document.getElementById("upcoming-count").textContent = total;
  document.getElementById("attended-count").textContent = 0;
  document.getElementById("missed-count").textContent = 0;
}

function setupSearch() {
  const input = document.getElementById("search-events");
  input.addEventListener("input", (e) => {
    const val = e.target.value.toLowerCase();
    const cards = document.querySelectorAll(".events .card");
    cards.forEach((c) => {
      const title = c.querySelector("h2").textContent.toLowerCase();
      c.style.display = title.includes(val) ? "block" : "none";
    });
  });
}

window.onload = function () {
  setupSearch();
  google.accounts.id.initialize({
    client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
    callback: handleCredentialResponse,
  });

  google.accounts.id.renderButton(
    document.getElementById("login-button"),
    { theme: "outline", size: "large" }
  );
};
