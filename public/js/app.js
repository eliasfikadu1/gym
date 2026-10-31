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
      menuToggle.setAttribute("aria-label", "Open navigation menu");
      menuToggle.textContent = "☰";
    });
  });
}

const currentYear = document.getElementById("currentYear");

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}
// LOAD MEMBERS FROM DATABASE

const memberList = document.getElementById("memberList");

async function loadMembers() {
  if (!memberList) return;

  try {
    const response = await fetch(
      "https://gym-cdb7.onrender.com/api/members"
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to load members");
    }

    memberList.innerHTML = "";

    if (!data.members || data.members.length === 0) {
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

      row.innerHTML = 
        <td>${member.id ?? ""}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      ;

      const cells = row.querySelectorAll("td");

      cells[1].textContent = member.full_name || "";
      cells[2].textContent = member.email || "";
      cells[3].textContent = member.phone || "";
      cells[4].textContent = member.plan || "";

      const screenshotCell = cells[5];

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

      cells[6].textContent = member.payment_status || "Pending";

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