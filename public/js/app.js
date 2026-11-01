const API = "https://gym-cdb7.onrender.com";

// MOBILE MENU
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Close navigation menu" : "Open navigation menu"
    );

    menuToggle.textContent = isOpen ? "✕" : "☰";
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.textContent = "☰";
    });
  });
}

// CURRENT YEAR
const currentYear = document.getElementById("currentYear");

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}
// LOAD MEMBERS
const memberList = document.getElementById("memberList");

async function loadMembers() {
  if (!memberList) return;

  memberList.innerHTML =` 
    <tr>
      <td colspan="7">Loading members...</td>
    </tr>
  `;

  try {
    const response = await fetch(`${API}/api/members`, {
      method: "GET",
      credentials: "include"
    });

    console.log("API STATUS:", response.status);

    const result = await response.json();

    console.log("API RESULT:", result);
    console.log("MEMBERS:", result.members);

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Failed to load members");
    }

    const members = result.members || [];

    if (members.length === 0) {
      memberList.innerHTML =` 
        <tr>
          <td colspan="7">No members registered yet.</td>
        </tr>
      `;
      return;
    }

    memberList.innerHTML = members.map(member =>`
      <tr>
        <td>${member.id ?? ""}</td>
        <td>${member.full_name ?? ""}</td>
        <td>${member.email ?? ""}</td>
        <td>${member.phone ?? ""}</td>
        <td>${member.plan ?? ""}</td>
        <td>${member.payment_status ?? "Pending"}</td>
        <td>${member.created_at ? new Date(member.created_at).toLocaleDateString() : ""}</td>
      </tr>
    `).join("");

  } catch (error) {
    console.error("LOAD MEMBERS ERROR:", error);

    memberList.innerHTML =`
      <tr>
        <td colspan="7">Failed to load members.</td>
      </tr>
    `;
  }
}

loadMembers();