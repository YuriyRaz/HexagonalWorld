export function generateSchoolData() {
  const classes = [
    { name: '10A Math', studentCount: 15 },
    { name: '10B Physics', studentCount: 14 },
    { name: '11A Chemistry', studentCount: 18 },
    { name: '11B Biology', studentCount: 12 },
    { name: '12A Literature', studentCount: 16 },
    { name: '12B History', studentCount: 11 },
  ];

  const students = [];
  let studentId = 1;

  classes.forEach((cls, classIndex) => {
    for (let i = 0; i < cls.studentCount; i++) {
      students.push({
        id: studentId++,
        name: `Student ${i + 1}`,
        className: cls.name,
        classIndex: classIndex,
        // Optional: generate some fake grades or stats for visual variety
        grade: 50 + Math.random() * 50, 
      });
    }
  });

  return students;
}
