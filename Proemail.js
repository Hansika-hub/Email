function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("show");
}

const BACKEND_URL = "https://email-backend-bu9l.onrender.com";
let accessToken = null;
let tokenClient = null;

async function handleCredentialResponse(response) {
  const idToken = response.credential;

  try {
    const res = await fetch(`${BACKEND_URL}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: idToken }),
      credentials: "include"
    });

    if (!res.ok) throw new Error(`ID token verification failed: ${await res.text()}`);
    const data = await res.json();

    localStorage.setItem("userEmail", data.user);
    localStorage.setItem("lastLogin", Date.now().toString());

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
      scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events",
      access_type: "offline",
      prompt: "consent",
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          console.error("Access token error:", tokenResponse.error);
          showError("Authentication failed. Please try again.");
          return;
        }

        accessToken = tokenResponse.access_token;
        localStorage.setItem("accessToken", accessToken);

        // Store refresh token if present
        if (tokenResponse.refresh_token) {
          try {
            const storeRes = await fetch(`${BACKEND_URL}/store-tokens`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userEmail: localStorage.getItem("userEmail"),
                refreshToken: tokenResponse.refresh_token,
              }),
            });
            if (!storeRes.ok) console.error("Failed to store refresh token:", await storeRes.text());
          } catch (err) {
            console.error("Failed to store refresh token:", err);
          }
        }

        showLogout();
        startTokenRefreshInterval();

        try {
          const emails = await fetchEmails();
          await processAllEmails(emails, 10);
        } catch (err) {
          console.error("Initial email fetch failed:", err);
          showError("Failed to load emails. Please try again later.");
        }
      },
    });

    tokenClient.requestAccessToken();
  } catch (err) {
    console.error("Login failed:", err);
    showError("Login failed. Please try again.");
  }
}

function startTokenRefreshInterval() {
  setInterval(() => {
    if (tokenClient && localStorage.getItem("userEmail")) {
      tokenClient.requestAccessToken();
    }
  }, 30 * 60 * 1000);
}

async function fetchEmails(retries = 3, delay = 1000) {
  const emailError = document.getElementById("email-error");
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const userEmail = localStorage.getItem("userEmail");
      const res = await fetch(`${BACKEND_URL}/fetch_emails`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "X-User-Email": userEmail,
        },
        credentials: "include",
      });

      if (res.status === 401) {
        showError("Session expired. Please log in again.");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("lastLogin");
        showLogin();
        return [];
      }

      if (!res.ok) throw new Error(`Email fetch failed: ${await res.text()}`);
      return await res.json();
    } catch (err) {
      console.error(`Fetch emails attempt ${attempt} failed:`, err);
      if (attempt === retries) {
        showError("Failed to fetch emails after multiple attempts.");
        return [];
      }
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function processAllEmails(emails, limit = 10) {
  const eventsList = document.getElementById("events-list");
  const processedEmails = new Set();
  let count = 0;

  for (let email of emails) {
    if (count >= limit) break;
    if (processedEmails.has(email.id)) continue;
    processedEmails.add(email.id);

    try {
      const res = await fetch(`${BACKEND_URL}/process_emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ emailId: email.id }),
        credentials: "include",
      });

      if (res.status === 401) {
        showError("Session expired. Please log in again.");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("lastLogin");
        showLogin();
        return;
      }

      if (!res.ok) throw new Error(`Event extraction failed: ${await res.text()}`);
      const events = await res.json();

      if (events.length > 0) {
        for (let event of events) {
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = `
            <div style="color: #8b5cf6; font-weight: bold;">${event.type || "Event"}</div>
            <h2>${event.event_name || "No Title"}</h2>
            <p>📅 ${event.date || "N/A"}</p>
            <p>⏰ ${event.time || "N/A"}</p>
            <p>📍 ${event.venue || "N/A"}</p>
          `;
          eventsList.appendChild(card);

          try {
            const response = await fetch(`${BACKEND_URL}/add_to_calendar`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(event),
              credentials: "include",
            });

            if (response.ok) {
              const statusDiv = document.createElement("div");
              statusDiv.textContent = "✅ Added to Calendar";
              statusDiv.style.color = "green";
              statusDiv.style.fontSize = "0.9rem";
              statusDiv.style.marginTop = "5px";
              statusDiv.style.fontWeight = "bold";
              card.appendChild(statusDiv);
            } else {
              console.error("❌ Failed to add to calendar:", await response.text());
            }
          } catch (calendarErr) {
            console.error("❌ Calendar add failed:", calendarErr);
          }
        }
        updateSummary(events);
      }
      count++;
    } catch (err) {
      console.error(`Error processing email ${email.id}:`, err);
      continue;
    }
  }

  console.log(`✅ Processed ${count} email(s) for events`);
}

/**
 * Fetch all persisted events from the backend and render them
 */
async function fetchAllEvents() {
  const eventsList = document.getElementById("events-list");
  eventsList.innerHTML = "";

  try {
    const res = await fetch(`${BACKEND_URL}/events`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "X-User-Email": localStorage.getItem("userEmail"),
      },
      credentials: "include"
    });

    if (!res.ok) throw new Error(`Failed to load events: ${await res.text()}`);
    const events = await res.json();
    renderEvents(events);
  } catch (err) {
    console.error("❌ fetchAllEvents error:", err);
  }
}

/**
 * Render events array into cards and update summary
 */
function renderEvents(events) {
  const eventsList = document.getElementById("events-list");
  eventsList.innerHTML = "";

  for (let event of events) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div style="color: #8b5cf6; font-weight: bold;">${event.type || "Event"}</div>
      <h2>${event.event_name || "No Title"}</h2>
      <p>📅 ${event.date || "N/A"}</p>
      <p>⏰ ${event.time || "N/A"}</p>
      <p>📍 ${event.venue || "N/A"}</p>
    `;
    eventsList.appendChild(card);
  }
  updateSummary(events);
}

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
      credentials: "include",
    });

    if (res.status === 401) {
      showError("Session expired. Please log in again.");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("lastLogin");
      showLogin();
      return;
    }

    if (!res.ok) throw new Error(`Event extraction failed: ${await res.text()}`);
    const events = await res.json();

    eventsList.innerHTML = "";
    events.forEach((event) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div style="color: #8b5cf6; font-weight: bold;">${event.type || "Event"}</div>
        <h2>${event.event_name || "No Title"}</h2>
        <p>📅 ${event.date || "N/A"}</p>
        <p>⏰ ${event.time || "N/A"}</p>
        <p>📍 ${event.venue || "N/A"}</p>
      `;
      eventsList.appendChild(card);
    });
    updateSummary(events);
  } catch (err) {
    console.error("Fetch events error:", err);
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
function showError(message) {
  const emailError = document.getElementById("email-error");
  emailError.style.display = "block";
  emailError.textContent = message;
}


window.onload = function () {
  setupSearch();

  const userEmail        = localStorage.getItem("userEmail");
  const lastLogin        = parseInt(localStorage.getItem("lastLogin") || "0");
  const savedAccessToken = localStorage.getItem("accessToken");

  if (userEmail && savedAccessToken && Date.now() - lastLogin < 7 * 24 * 60 * 60 * 1000) {
    accessToken = savedAccessToken;
    showLogout();

     tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
      scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events",
      access_type: "offline",
      prompt: "consent",
      callback: (tokenResponse) => {
        accessToken = tokenResponse.access_token;
        localStorage.setItem("accessToken", accessToken);
      },
    });
    startTokenRefreshInterval();

    // process new unread emails
    fetchEmails().then(emails => processAllEmails(emails, 10));
    // then load and render all persisted events
    fetchAllEvents();
  } else {
    google.accounts.id.initialize({
      client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
      callback: handleCredentialResponse,
      auto_select: false,
    });

    google.accounts.id.renderButton(document.getElementById("login-button"), {
      theme: "outline",
      size: "large",
      width: 300,
    });

    google.accounts.id.prompt();
    showLogin();
  }

  document.getElementById("logoutButton").addEventListener("click", () => {
    const email = localStorage.getItem("userEmail");

    localStorage.removeItem("accessToken");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("lastLogin");
    accessToken = null;

    document.getElementById("events-list").innerHTML = "";
    document.getElementById("total-events").textContent = 0;
    document.getElementById("this-week-events").textContent = 0;
    document.getElementById("total-attendees").textContent = 0;
    document.getElementById("upcoming-count").textContent = 0;
    document.getElementById("attended-count").textContent = 0;
    document.getElementById("missed-count").textContent = 0;

    showLogin();

    google.accounts.id.initialize({
      client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
      callback: handleCredentialResponse,
      auto_select: false,
    });

    google.accounts.id.renderButton(document.getElementById("login-button"), {
      theme: "outline",
      size: "large",
      width: 300,
    });

    if (email) {
      google.accounts.id.revoke(email, () => {
        console.log("✅ Google session revoked");
      });
    }
  });
};

function showLogin() {
  document.getElementById("loginDiv").style.display = "block";
  document.getElementById("logoutButton").style.display = "none";
}

function showLogout() {
  document.getElementById("loginDiv").style.display = "none";
  document.getElementById("logoutButton").style.display = "inline-block";
}

