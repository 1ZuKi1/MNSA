-- LOCAL DEVELOPMENT ONLY. Fictional people on the reserved .test domain.
-- Log in as any of these; with no RESEND_API_KEY the code prints in the terminal.

INSERT INTO users (id,email,name_mn,student_id,role,department_id,is_deputy,status,session_version,term_ends_at,created_by,created_at) VALUES
  (1,'president@demo.test','Б. Тэмүүлэн','2201110001','president',1,0,'active',1,1822319940,1,1790136000),
  (2,'board@demo.test','Д. Номин','2101110002','board',1,0,'active',1,1822319940,1,1790136000),
  (3,'dotood@demo.test','Г. Анударь','2301110003','head',2,0,'active',1,1822319940,1,1790136000),
  (4,'dotood2@demo.test','Э. Билгүүн','2401110004','member',2,0,'active',1,1822319940,1,1790136000),
  (5,'gadaad@demo.test','Т. Батбаяр','2301110005','head',3,0,'active',1,1822319940,1,1790136000),
  (6,'surgalt@demo.test','О. Энхжин','2201110006','head',4,0,'active',1,1822319940,1,1790136000),
  (7,'media@demo.test','С. Хулан','2301110007','head',5,0,'active',1,1822319940,1,1790136000),
  (8,'media2@demo.test','Ц. Мөнхжин','2401110008','member',5,0,'active',1,1822319940,1,1790136000),
  (9,'legal@demo.test','Ж. Саруул','2201110009','head',6,1,'active',1,1822319940,1,1790136000),
  (10,'dev@demo.test','Техникийн хариуцагч','2301110010','maintainer',NULL,0,'active',1,1822319940,1,1790136000);

INSERT INTO counters (key,value) VALUES ('МОХ-УД/2627/А/',1),('МОХ-ДХ/2627/Х/',1),('МОХ-МХ/2627/Т/',1);
INSERT INTO records (id,type,department_id,author_id,academic_year,number,title,fields_json,status,step,awaiting,visibility,version,submitted_at,decided_at,created_at,updated_at) VALUES
  (1,'albn-bichig',1,1,'2026-2027','МОХ-УД/2627/А/001','Удирдлагын бүрэлдэхүүнийг мэдэгдэх тухай','{"recipient":"БНХАУ-ын Бээжингийн Их Сургуулийн Гадаад оюутны алба","body":"Монгол оюутны холбооны 2026–2027 оны хичээлийн жилийн удирдлагын бүрэлдэхүүнийг хавсралтаар хүргүүлж байна.","attachments_note":"Удирдлагын бүрэлдэхүүний жагсаалт, 1 хуудас"}','approved',3,NULL,'staff',1,1789437600,1789520400,1789434000,1789520400),
  (2,'huselt',2,4,'2026-2027','МОХ-ДХ/2627/Х/001','Шинэ оюутныг угтах арга хэмжээ','{"event_date":"2026-10-10","venue":"Оюутны төв, 2 давхар","participants":"60","budget":"1200","purpose":"Шинээр элссэн Монгол оюутнуудыг холбоотой танилцуулж, ахлах ангийнхантай нь холбох.","needs":"Танхим, проектор, зууш ундаа"}','in_review',1,'president','staff',1,1789884000,NULL,1789819200,1789956000),
  (3,'tailan',5,8,'2026-2027','МОХ-МХ/2627/Т/001','Нээлтийн уулзалтын тайлан','{"report_kind":"Улирлын эцсийн","period":"2026 оны 9-р сар","members":"С. Хулан (Хэлтсийн дарга), Ц. Мөнхжин","work":"Шинэ хичээлийн жилийн нээлтийн уулзалтыг зохион байгууллаа. Огноо: 9-р сарын 12. Хариуцсан: С. Хулан, Ц. Мөнхжин.","results":"42 оюутан оролцож, 11 шинэ оюутан холбоонд бүртгүүлэв.","next_steps":"10-р сард угтах арга хэмжээ зохион байгуулна."}','approved',1,NULL,'staff',1,1789552800,1789614000,1789549200,1789614000),
  (4,'albn-bichig',6,9,'2026-2027',NULL,'Гишүүнчлэлийн батламжийн загвар','{"recipient":"Холбооны гишүүд","body":"Ноорог.","attachments_note":""}','draft',0,NULL,'dept',1,NULL,NULL,1790064000,1790064000);
INSERT INTO record_versions (record_id,version,title,fields_json,author_id,created_at) SELECT id,1,title,fields_json,author_id,created_at FROM records;
INSERT INTO record_actions (record_id,actor_id,action,step,comment,created_at) VALUES
  (1,1,'create',NULL,NULL,1789434000),(1,1,'submit',NULL,NULL,1789437600),(1,9,'approve','legal',NULL,1789518600),(1,1,'auto','president',NULL,1789520400),
  (2,4,'create',NULL,NULL,1789819200),(2,4,'submit',NULL,NULL,1789884000),(2,3,'approve','head','Төсвийг 1200 юаньд багтаая.',1789956000),
  (3,8,'create',NULL,NULL,1789549200),(3,8,'submit',NULL,NULL,1789552800),(3,7,'approve','head',NULL,1789614000),
  (4,9,'create',NULL,NULL,1790064000);

INSERT INTO events (id,slug,title,summary,body,starts_at,ends_at,location,department_id,status,academic_year,created_by,published_by,published_at,created_at,updated_at) VALUES
  (1,'shine-oyutan-ugtah','Шинэ оюутныг угтах арга хэмжээ','Шинээр элссэн Монгол оюутнуудтай танилцах үдэш.','Шинээр элссэн оюутнууд холбооны гишүүд, ахлах ангийнхантайгаа танилцаж, их сургуулийн амьдралын талаар асуух боломжтой.',1791626400,1791637200,'Оюутны төв, 2 давхар',2,'published','2026-2027',7,7,1790049600,1789963200,1790049600),
  (2,'neeltiin-uulzalt','Шинэ хичээлийн жилийн нээлтийн уулзалт','2026–2027 оны хичээлийн жилийг нээж, шинэ удирдлагаа танилцууллаа.','42 оюутан оролцож, холбооны энэ жилийн төлөвлөгөөг хэлэлцэв. 11 шинэ оюутан холбоонд бүртгүүлэв.',1789290000,1789300800,'Бээжингийн Их Сургууль, 理教 107',1,'published','2026-2027',7,7,1789351200,1789005600,1789351200),
  (3,'sport-udur','Цинхуагийн Монгол оюутнуудтай хамтарсан спортын өдөр','Ноорог — огноо тохирч байна.',NULL,1794621600,1794646800,'Бээжингийн Их Сургуулийн спорт заал',3,'draft','2026-2027',7,NULL,NULL,1790060400,1790060400);
INSERT INTO events (id,slug,title,summary,body,starts_at,ends_at,location,department_id,status,academic_year,created_by,published_by,published_at,created_at,updated_at) VALUES
  (4,'soyoliin-udurlug-2026','Соёлын өдөрлөг 2026','Монгол соёл, уламжлалаа бусад орны оюутнуудад танилцуулах өдөрлөг.','Бүх хэлтэс хамтран зохион байгуулна.',1792216800,1792231200,'Бээжингийн Их Сургууль',3,'published','2026-2027',1,7,1789876800,1789876800,1789876800);
INSERT INTO event_tasks (id,event_id,title,due_at,department_id,status,sort_order,created_by,created_at) VALUES
  (1,1,'Танхим захиалах',1790848800,2,'done',1,7,1789963200),
  (2,1,'Зурагт хуудас хийх',1791021600,5,'open',2,7,1789963200),
  (3,1,'Бүртгэл хөтлөх',1791626400,NULL,'open',3,7,1789963200),
  (4,1,'Зууш ундаа авах',1791540000,2,'open',4,7,1789963200),
  (5,2,'Танхим бэлдэх',1789207200,2,'done',1,7,1789005600),
  (6,2,'Зураг авах',1789290000,5,'done',2,7,1789005600),
  (7,2,'Илтгэл бэлтгэх',1789207200,1,'done',3,7,1789005600);
INSERT INTO task_assignments (task_id,user_id,volunteered,assigned_by,status,assigned_at,finished_at) VALUES
  (1,4,1,4,'done',1789966800,1790049600),
  (2,8,0,7,'active',1789966800,NULL),
  (4,3,1,3,'active',1790038800,NULL),
  (5,4,0,3,'done',1789009200,1789207200),
  (6,8,1,8,'done',1789012800,1789300800),
  (7,1,1,1,'done',1789012800,1789214400),
  (6,7,0,7,'dropped',1789007400,1789012800);

-- «Ажлууд»: work outside events
INSERT INTO jobs (id,title,notes,department_id,owner_id,status,visibility,due_at,created_by,created_at,updated_at,done_at) VALUES
  (1,'Гишүүдийн жагсаалтыг шинэчлэх','Хэлтэс бүрээс шинэ гишүүдийн нэр, оюутны дугаарыг цуглуулна.',2,4,'doing','dept',1790899200,3,1789900000,1790150000,NULL),
  (2,'10-р сарын төсвийн төлөвлөгөө','',1,2,'todo','staff',1791331200,1,1790000000,1790000000,NULL),
  (3,'Instagram-ийн 10-р сарын нийтлэлийн хуваарь','',5,8,'done','staff',NULL,7,1789800000,1790222400,1790222400),
  (4,'Хурлын дэгийн журмын төслийг хянах','',6,9,'todo','dept',NULL,9,1790100000,1790100000,NULL);
INSERT INTO job_updates (job_id,user_id,status,note,created_at) VALUES
  (1,4,'doing','Дотоод хэлтсийн жагсаалт бэлэн, бусад хэлтсийнхийг хүлээж байна.',1790150000),
  (3,8,'doing',NULL,1790000000),
  (3,8,'done','Хуваарийг Медиа хэлтсийн группэд илгээсэн.',1790222400);
