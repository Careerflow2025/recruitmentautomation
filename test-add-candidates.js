// Test script to add all 11 candidates to the AI system
// This simulates the user adding candidates through the AI assistant

const candidateData = [
  {
    id: "299047",
    phone: "07861850730",
    postcode: "WA4 2GU",
    role: "Dental Nurse",
    salary: "",
    days: "Mon, Tue, Thu",
    experience: "",
    notes: "ASAP start"
  },
  {
    id: "299026", 
    phone: "07783723570",
    postcode: "TF1 5DL",
    role: "Receptionist",
    salary: "£13/hr",
    days: "Full-time, flexible",
    experience: "",
    notes: "Already registered, waiting for DBS, start ASAP"
  },
  {
    id: "298956",
    phone: "07926416500", 
    postcode: "SN25 2PN",
    role: "Dental Nurse",
    salary: "£14/hr",
    days: "Full-time, flexible",
    experience: "4 yrs",
    notes: "Not driving, ready ASAP"
  },
  {
    id: "299051",
    phone: "07704255514",
    postcode: "SO19 8AX", 
    role: "Receptionist",
    salary: "£14/hr",
    days: "PT Mon–Thu 9–5",
    experience: "7 yrs",
    notes: "Looking permanent, ASAP"
  },
  {
    id: "299030",
    phone: "07428679800",
    postcode: "SE27 0QQ",
    role: "Dental Nurse",
    salary: "",
    days: "PT preferred",
    experience: "Not fully qualified",
    notes: "Poor reception, call back later"
  },
  {
    id: "298961",
    phone: "07380580431",
    postcode: "L36 8FG",
    role: "Dental Nurse", 
    salary: "£12/hr",
    days: "Full-time, flexible",
    experience: "1 yr",
    notes: "Not qualified (no exam), RFOR + other system, ASAP"
  },
  {
    id: "299092",
    phone: "07831808105",
    postcode: "IP22 2JF",
    role: "Trainee Dental Nurse",
    salary: "£13/hr", 
    days: "FT/PT, start end Nov",
    experience: "2 yrs",
    notes: "Will qualify in April, EXACT system"
  },
  {
    id: "298970",
    phone: "07367121011",
    postcode: "WF12 0DS",
    role: "Trainee Dental Nurse",
    salary: "£13–15/hr",
    days: "PT flexible",
    experience: "3 yrs", 
    notes: "Prefers Dewsbury/Batley, R4 & iSmile"
  },
  {
    id: "299115",
    phone: "07879317513",
    postcode: "DA8 2EQ",
    role: "Dental Nurse",
    salary: "£15/hr",
    days: "PT flexible, start in 2 weeks",
    experience: "7 yrs",
    notes: "Systems: R4, SOE"
  },
  {
    id: "298976",
    phone: "07538359285", 
    postcode: "EN3 6QX",
    role: "Dental Nurse",
    salary: "£13/hr",
    days: "PT flexible, ASAP",
    experience: "1 yr 3 mo",
    notes: "Systems: SOE, PEARL"
  },
  {
    id: "299038",
    phone: "07591047672",
    postcode: "BH12",
    role: "Receptionist", 
    salary: "£15/hr",
    days: "PT/FT",
    experience: "5+ yrs",
    notes: "Systems: Dentally, R4, available in few weeks"
  }
];

// Generate commands that can be used with the AI assistant
console.log("=== AI Assistant Commands to Add All Candidates ===\n");

candidateData.forEach((candidate, index) => {
  const salaryText = candidate.salary || "DOE";
  const experienceText = candidate.experience ? ` with ${candidate.experience} experience` : "";
  const notesText = candidate.notes ? ` - ${candidate.notes}` : "";
  
  console.log(`${index + 1}. Add candidate ${candidate.id} - ${candidate.role} in ${candidate.postcode}, phone ${candidate.phone}, salary ${salaryText}, working ${candidate.days}${experienceText}${notesText}`);
});

console.log("\n=== Formatted for AI Chat ===\n");
console.log("You can copy each command above and paste it into the AI assistant chat.");
console.log("The AI assistant will use the add_candidate tool to add each candidate to your user account.");