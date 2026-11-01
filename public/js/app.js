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

  memberList.innerHTML = 
    <tr>
      <td colspan="7">Loading members...</td>
    </tr>
  ;

  try {
    const response = await fetch(`${API}/api/members`, {
      method: "GET",
      credentials: "include"
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to load members");
    }

    memberList.innerHTML = "";

    if (!Array.isArray(data.members) || data.members.length === 0) {
      memberList.innerHTML = 
        <tr>
          <td colspan="7" class="empty">
            No members registered yet.
          </td>
        </tr>
      ;
      return;
    }

    data.members.forEach((member) => {
      const row = document.createElement("tr");

      const values = [
        member.id ?? "",
        member.full_name ?? "",
        member.email ?? "",
        member.phone ?? "",
        member.plan ?? member.membership_plan ?? "",
      ];

      values.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });

      // PAYMENT SCREENSHOT
      const screenshotCell = document.createElement("td");

      if (member.payment_screenshot) {
        const link = document.createElement("a");

        link.href = member.payment_screenshot;
        link.textContent = "View Screenshot";
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        screenshotCell.appendChild(link);
      } else {
        screenshotCell.textContent = "Not uploaded";
      }

      row.appendChild(screenshotCell);

      // PAYMENT STATUS
      const statusCell = document.createElement("td");
      statusCell.textContent = member.payment_status || "Pending";

      row.appendChild(statusCell);

      memberList.appendChild(row);
    });

  } catch (error) {
    console.error("MEMBERS ERROR:", error);

    memberList.innerHTML = 
      <tr>
        <td colspan="7" class="empty">
          Failed to load members. Please refresh.
        </td>
      </tr>
    ;
  }
}

loadMembers();