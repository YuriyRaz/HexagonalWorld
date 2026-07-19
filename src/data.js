const classNames = [
  '10A Math',
  '10B Physics',
  '11A Chemistry',
  '11B Biology',
  '12A Literature',
  '12B History',
];

export function generateSchoolData({ classCount = 6, minStudents = 11, maxStudents = 18 } = {}) {
  const classes = Array.from({ length: classCount }, (_, index) => ({
    name: classNames[index] ?? `Class ${index + 1}`,
    studentCount: Math.floor(Math.random() * (maxStudents - minStudents + 1)) + minStudents,
  }));

  const students = [];
  let studentId = 1;

  classes.forEach((cls, classIndex) => {
    for (let i = 0; i < cls.studentCount; i++) {
      const mark = 40 + ((studentId * 37 + classIndex * 17) % 61);

      students.push({
        id: studentId++,
        name: `Student ${i + 1}`,
        className: cls.name,
        classIndex: classIndex,
        mark,
      });
    }
  });

  return students;
}
