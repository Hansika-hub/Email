// Sidebar toggle
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("show");
}

const BACKEND_URL = "https://email-backend-bu9l.onrender.com";
let accessToken = null;

// Refresh Gmail access token
function refreshAccessToken() {
  return new Promise((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            console.error("Token refresh failed", tokenResponse);
            reject("Token refresh error");
          } else {
            accessToken = tokenResponse.access_token;
            localStorage.setItem("accessToken", accessToken);
            resolve(accessToken);
          }
        },
      })
      .requestAccessToken();
  });
}

// Handle Google Sign-In response
function handleCredentialResponse(response) {
  const idToken = response.credential;
  const payload = JSON.parse(atob(idToken.split('.')[1]));
  const email = payload.email;

  localStorage.setItem("userEmail", email);

  // Step 1: Verify ID token with backend
  fetch(`${BACKEND_URL}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: idToken }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("ID token verification failed");
      return res.json();
    })
    .then(() => {
      // Step 2: Get Gmail access token
      google.accounts.oauth2
        .initTokenClient({
          client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
          scope: "https://www.googleapis.com/auth/gmail.readonly",
          callback: (tokenResponse) => {
            if (tokenResponse.error) throw new Error("Access token error");
            accessToken = tokenResponse.access_token;
            localStorage.setItem("accessToken", accessToken);
            showLogout();
            fetchEmails();
          },
        })
        .requestAccessToken();
    })
    .catch((err) => {
      console.error("Login failed:", err);
      const errBox = document.getElementById("email-error");
      errBox.style.display = "block";
      errBox.textContent = "Login failed. Try again.";
    });
}

// Fetch unread emails
async function fetchEmails() {
  const emailList = document.getElementById("email-list");
  const emailLoading = document.getElementById("email-loading");
  const emailError = document.getElementById("email-error");
  const eventsList = document.getElementById("events-list");

  emailLoading.style.display = "block";
  emailError.style.display = "none";

  try {
    const res = await fetch(`${BACKEND_URL}/fetch_emails`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) throw new Error("Email fetch failed");

    const emails = await res.json();
    emailList.innerHTML = "";
    eventsList.innerHTML = "";

    let totalExtractedEvents = [];

    for (const email of emails) {
      const eventRes = await fetch(`${BACKEND_URL}/process_emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ emailId: email.id }),
      });

      if (!eventRes.ok) continue;

      const events = await eventRes.json();

      const validEvents = events.filter(event => {
        let count = 0;
        if (event.event_name) count++;
        if (event.date) count++;
        if (event.time) count++;
        if (event.venue) count++;
        return count >= 3;
      });

      totalExtractedEvents.push(...validEvents);
    }

    displayEventCards(totalExtractedEvents);
    updateSummary(totalExtractedEvents);

  } catch (err) {
    console.error(err);
    emailError.style.display = "block";
    emailError.textContent = "Failed to fetch or process emails.";
  } finally {
    emailLoading.style.display = "none";
  }
}

// Fetch events from a selected email
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
    console.error(err);
    eventsError.style.display = "block";
    eventsError.textContent = "No events found for this email.";
  } finally {
    eventsLoading.style.display = "none";
  }
}

// Display event cards
function displayEventCards(events) {
  const eventsList = document.getElementById("events-list");
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
}

// Update dashboard metrics
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

  const attendees = events.reduce(
    (sum, ev) => sum + (parseInt(ev.attendees) || 0),
    0
  );

  document.getElementById("total-events").textContent = total;
  document.getElementById("this-week-events").textContent = thisWeek;
  document.getElementById("total-attendees").textContent = attendees;
  document.getElementById("upcoming-count").textContent = total;
  document.getElementById("attended-count").textContent = 0;
  document.getElementById("missed-count").textContent = 0;
}

// Search setup
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

// UI toggles
function showLogin() {
  document.getElementById("loginDiv").style.display = "block";
  document.getElementById("logoutButton").style.display = "none";
}

function showLogout() {
  document.getElementById("loginDiv").style.display = "none";
  document.getElementById("logoutButton").style.display = "inline-block";
}

// Init on page load
window.onload = async function () {
  setupSearch();

  const storedToken = localStorage.getItem("accessToken");

  if (storedToken) {
    accessToken = storedToken;
    showLogout();

    try {
      await fetchEmails();
    } catch (e) {
      console.warn("⚠️ Stored token may be expired. Refreshing...");
      try {
        await refreshAccessToken();
        await fetchEmails();
      } catch (e2) {
        console.error("❌ Token refresh failed or email fetch failed again");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("userEmail");
        accessToken = null;
        showLogin();
      }
    }
  } else {
    try {
      google.accounts.id.initialize({
        client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
      });

      google.accounts.id.renderButton(document.getElementById("login-button"), {
        theme: "outline",
        size: "large",
        width: 300,
      });

      google.accounts.id.prompt();
    } catch (err) {
      console.error("GSI Initialization failed:", err);
      document.getElementById("email-error").style.display = "block";
      document.getElementById("email-error").textContent = "Google Sign-In init failed.";
    }
  }

  document.getElementById("logoutButton").addEventListener("click", function () {
    const email = localStorage.getItem("userEmail");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("userEmail");
    accessToken = null;

    document.getElementById("events-list").innerHTML = "";
    document.getElementById("email-list").innerHTML = "";
    document.getElementById("total-events").textContent = 0;
    document.getElementById("this-week-events").textContent = 0;
    document.getElementById("total-attendees").textContent = 0;
    document.getElementById("upcoming-count").textContent = 0;
    document.getElementById("attended-count").textContent = 0;
    document.getElementById("missed-count").textContent = 0;

    showLogin();

    if (email) {
      google.accounts.id.revoke(email, () => {
        console.log("🔓 Google session revoked");
      });
    }
  });
};
