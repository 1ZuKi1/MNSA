#!/usr/bin/env bash
# Usage: npm run db:reset, then npm run dev, then (in another terminal) bash tests/e2e.sh
# Needs only bash and curl — Git Bash on Windows is enough.
# End-to-end test against `astro dev` on :4321. Each role gets its own cookie jar.
B=http://127.0.0.1:4321; S="Host: dep.localhost:4321"; P="Host: localhost:4321"; O="Origin: http://dep.localhost:4321"
pass=0; fail=0
ok(){ echo "  ✓ $1"; pass=$((pass+1)); }
bad(){ echo "  ✗ $1"; fail=$((fail+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }
has(){ if echo "$2" | grep -q -- "$3"; then ok "$1"; else bad "$1 (missing '$3')"; fi; }
hasnt(){ if echo "$2" | grep -q -- "$3"; then bad "$1 (unexpected '$3')"; else ok "$1"; fi; }

login(){ # $1 = email, $2 = jar
  rm -f "$2"
  curl -s -c "$2" -b "$2" -H "$S" -H "$O" -o /dev/null -X POST --data-urlencode "email=$1" -d "action=request" $B/nevtreh
  local page code
  page=$(curl -s -c "$2" -b "$2" -H "$S" -G --data-urlencode "step=code" --data-urlencode "email=$1" "$B/nevtreh")
  code=$(echo "$page" | grep -o 'num[^>]*>[0-9]\{6\}' | grep -o '[0-9]\{6\}')
  curl -s -c "$2" -b "$2" -H "$S" -H "$O" -o /dev/null -X POST --data-urlencode "email=$1" -d "action=verify&code=$code" $B/nevtreh
}
get(){ curl -s -b "$1" -H "$S" "$B$2"; }
code(){ curl -s -o /dev/null -w "%{http_code}" -b "$1" -H "$S" "$B$2"; }
post(){ # jar path data... → prints redirect location
  local jar=$1 path=$2; shift 2
  curl -s -o /dev/null -w "%{redirect_url}" -b "$jar" -c "$jar" -H "$S" -H "$O" -X POST "$@" "$B$path"
}

J=$(mktemp -d)
for u in president board dotood dotood2 gadaad media media2 legal dev; do login "$u@demo.test" $J/$u.jar; done

echo "── sessions"
check "president dashboard" "$(code $J/president.jar /)" 200
check "maintainer dashboard" "$(code $J/dev.jar /)" 200
has "member sees own name" "$(get $J/dotood2.jar /)" "Билгүүн"

echo "── records: full approval chain (member → head → legal → president)"
loc=$(post $J/dotood2.jar /barimt/shine -d "type=albn-bichig&dept=dotood&visibility=staff&then=submit" \
  --data-urlencode "title=Танхим ашиглах зөвшөөрөл хүсэх тухай" --data-urlencode "f_recipient=Оюутны төвийн удирдлага" --data-urlencode "f_body=10-р сарын 10-нд танхим ашиглах зөвшөөрөл хүсье.")
RID=$(echo "$loc" | grep -o 'barimt/[0-9]*' | grep -o '[0-9]*'); echo "  record #$RID ($loc)"
has "submitted flash" "$loc" "ok=submitted"
pg=$(get $J/dotood2.jar /barimt/$RID)
has "number assigned on submit, in the President's format" "$pg" "МОХ-ДХ/2627/А/001"
has "awaiting the дарга" "$pg" "Хэлтсийн даргын"
has "дарга's queue shows it" "$(get $J/dotood.jar /)" "Танхим ашиглах"
hasnt "other дарга's queue doesn't" "$(get $J/gadaad.jar /)" "Танхим ашиглах"
has "other dept дарга cannot approve" "$(post $J/gadaad.jar /barimt/$RID -d action=approve)" "err=denied"
has "author cannot approve own" "$(post $J/dotood2.jar /barimt/$RID -d action=approve)" "err=denied"
has "reject needs a comment" "$(post $J/dotood.jar /barimt/$RID -d action=reject)" "err=comment"
has "дарга approves" "$(post $J/dotood.jar /barimt/$RID -d action=approve)" "ok=approved"
has "now awaiting Legal" "$(get $J/legal.jar /barimt/$RID)" "Эрх зүйн хэлтсийн"
has "Legal approves" "$(post $J/legal.jar /barimt/$RID -d action=approve)" "ok=approved"
has "President approves" "$(post $J/president.jar /barimt/$RID -d action=approve --data-urlencode "comment=Зөвшөөрөв")" "ok=approved"
pg=$(get $J/dotood2.jar /barimt/$RID)
has "status is approved" "$pg" "b-approved"
check "print page renders" "$(code $J/dotood2.jar /barimt/$RID/hevleh)" 200
has "print shows all three signers" "$(get $J/dotood2.jar /barimt/$RID/hevleh)" "Ж. Саруул"
pr=$(get $J/dotood2.jar /barimt/$RID/hevleh)
has "print has the President's signature line" "$pr" 's-title">Холбооны Тэргүүн'
has "…with the approver's name on it" "$pr" 's-name">Б. Тэмүүлэн'
has "…and Legal's beside it" "$pr" 's-title">Эрх Зүйн Хэлтэс'
has "…and the official date line" "$pr" "оны 9 дүгээр сарын"
hasnt "…and no stamp while none is uploaded" "$pr" "/tamga?v="
has "letterhead carries the Chinese name" "$pr" "北京大学蒙古国留学生学生会"
has "approved record is locked" "$(curl -s -o /dev/null -w '%{redirect_url}' -b $J/dotood.jar -H "$S" $B/barimt/$RID/zasah)" "err=denied"

echo "── records: the types added from the President's form"
pg=$(get $J/dotood2.jar /barimt/shine)
has "type list: activity plan" "$pg" "Үйл ажиллагааны төлөвлөгөө"
has "type list: election committee material" "$pg" "Сонгуулийн хорооны материал"
has "type list: constitution amendment" "$pg" "Үндсэн дүрмийн өөрчлөлт"
loc=$(post $J/legal.jar /barimt/shine -d "type=durem&dept=erh-zui&visibility=staff&then=submit" --data-urlencode "title=23.4 дэх заалтыг өөрчлөх" \
  --data-urlencode "f_articles=5-р бүлэг, 23.4" --data-urlencode "f_proposed_text=Шинэ найруулга." --data-urlencode "f_rationale=Үндэслэл.")
DID=$(echo "$loc" | grep -o 'barimt/[0-9]*' | grep -o '[0-9]*')
has "Legal's own amendment goes straight to the President" "$(get $J/legal.jar /barimt/$DID)" "Тэргүүний шийдвэрийг"
loc=$(post $J/dotood2.jar /barimt/shine -d "type=songuuli&dept=dotood&visibility=staff&then=submit" --data-urlencode "title=Сонгуулийн зар" \
  --data-urlencode "f_kind=Сонгуулийн зар" --data-urlencode "f_election=2027–2028 оны удирдлагын сонгууль" --data-urlencode "f_body=Нэр дэвшүүлэх хугацаа эхэллээ.")
EID=$(echo "$loc" | grep -o 'barimt/[0-9]*' | grep -o '[0-9]*')
has "election material waits for Legal" "$(get $J/dotood2.jar /barimt/$EID)" "Эрх зүйн хэлтсийн шийдвэрийг"
has "Legal approves it" "$(post $J/legal.jar /barimt/$EID -d action=approve)" "ok=approved"
has "…and it is done — no President step" "$(get $J/dotood2.jar /barimt/$EID)" "b-approved"
has "a required field is enforced" "$(curl -s -b $J/dotood2.jar -H "$S" -H "$O" -X POST -d "type=tolovlogoo&dept=dotood&visibility=staff&then=save" --data-urlencode "title=x" --data-urlencode "f_period=x" $B/barimt/shine)" "Заавал бөглөнө"

echo "── records: the association's own document kinds"
pg=$(get $J/president.jar '/barimt/shine?type=protokol')
has "a new protocol lists every department head" "$pg" "Сургалтын хэлтэс: О. Энхжин"
has "…and the writer as note-taker" "$pg" 'value="Б. Тэмүүлэн"'
has "a new report lists the department" "$(get $J/dotood2.jar '/barimt/shine?type=tailan')" "Г. Анударь (Хэлтсийн дарга), Э. Билгүүн"
has "a meeting kind must come from the list" "$(curl -s -b $J/president.jar -H "$S" -H "$O" -X POST -d "type=protokol&dept=udirdlaga&visibility=staff&then=save" --data-urlencode "title=x" --data-urlencode "f_meeting_type=Хуурамч" --data-urlencode "f_meeting_date=2026-10-01" --data-urlencode "f_attendees=x" --data-urlencode "f_agenda=x" --data-urlencode "f_decisions=x" $B/barimt/shine)" "Жагсаалтаас сонгоно уу"
loc=$(post $J/legal.jar /barimt/shine -d "type=medegdel&dept=erh-zui&visibility=staff&then=submit" --data-urlencode "title=Намрын улирлын үйл ажиллагаа хаагдаж буй тухай" \
  --data-urlencode "f_body=1. Тухай
1.1. Намрын улирлын үйл ажиллагаа дууслаа." --data-urlencode "f_closing=Энэ хүрээд мэдэгдэж байна.")
MID2=$(echo "$loc" | grep -o 'barimt/[0-9]*' | grep -o '[0-9]*')
has "Legal's notice goes straight to the President" "$(get $J/legal.jar /barimt/$MID2)" "Тэргүүний шийдвэрийг"
has "President approves the notice" "$(post $J/president.jar /barimt/$MID2 -d action=approve)" "ok=approved"
pr=$(get $J/legal.jar /barimt/$MID2/hevleh)
has "notice prints under its own heading" "$pr" '>МЭДЭГДЭЛ<'
has "…numbered with its type letter" "$pr" "МОХ-ЭЗХ/2627/М/001"
has "…with the closing line" "$pr" 'class="closing">Энэ хүрээд'
loc=$(post $J/president.jar /barimt/shine -d "type=choloolol&dept=udirdlaga&visibility=staff&then=submit" --data-urlencode "title=Б. Номин-Эрдэнийг чөлөөлөх тухай" \
  --data-urlencode "f_person=Баяржаргалын Номин-Эрдэнэ" --data-urlencode "f_position=Хэлтсийн дарга" --data-urlencode "f_department=Дотоод хэлтэс" \
  -d "f_term_start=2025-09-28&f_request_date=2025-10-27&f_effective_date=2025-10-27")
CID=$(echo "$loc" | grep -o 'barimt/[0-9]*' | grep -o '[0-9]*')
has "the President's own release is approved on submit" "$(get $J/president.jar /barimt/$CID)" "b-approved"
pr=$(get $J/president.jar /barimt/$CID/hevleh)
has "release prints the association's wording" "$pr" "Гурав. Нөхцөл, журам"
has "…with the dates written out" "$pr" "2025 оны 10 дугаар сарын 27"
has "…and the person signs beside the President" "$pr" 's-name">Баяржаргалын Номин-Эрдэнэ'
has "…numbered ГЦ" "$pr" "МОХ-УД/2627/ГЦ/001"

echo "── records: the department wall, open reading"
check "other dept can READ approved record" "$(code $J/gadaad.jar /barimt/$RID)" 200
check "maintainer can read" "$(code $J/dev.jar /barimt/$RID)" 200
check "dept-only draft hidden from other dept" "$(code $J/gadaad.jar /barimt/4)" 404
check "dept-only draft hidden from board (draft)" "$(code $J/board.jar /barimt/4)" 404
check "dept-only draft visible to its author" "$(code $J/legal.jar /barimt/4)" 200
pg=$(curl -s -b $J/dotood2.jar -H "$S" -H "$O" -X POST -d "type=tailan&dept=gadaad&visibility=staff&then=save" --data-urlencode "title=x" --data-urlencode "f_report_kind=Улирлын эцсийн" --data-urlencode "f_period=x" --data-urlencode "f_work=x" $B/barimt/shine)
has "posting into another dept is refused, with the reason" "$pg" "Энэ хэлтэст бичих эрх танд байхгүй"
check "…and nothing was created" "$(get $J/president.jar '/barimt?dept=gadaad' | grep -c 'class="row-link"')" 0
has "maintainer cannot create records" "$(curl -s -o /dev/null -w '%{redirect_url}' -b $J/dev.jar -H "$S" $B/barimt/shine)" "err=denied"
has "records list shows other dept (open read)" "$(get $J/gadaad.jar /barimt)" "Нээлтийн уулзалтын тайлан"
hasnt "records list hides dept-only draft" "$(get $J/gadaad.jar /barimt)" "Гишүүнчлэлийн батламжийн"

echo "── events: President + Media only"
has "dotood дарга cannot create events" "$(curl -s -o /dev/null -w '%{redirect_url}' -b $J/dotood.jar -H "$S" $B/uil-ajillagaa/shine)" "err=denied"
loc=$(post $J/media2.jar /uil-ajillagaa/shine -d "start_date=2026-10-24&start_time=19:00&end_date=2026-10-24&end_time=22:00&dept=gadaad" \
  --data-urlencode "title=Монгол хоолны үдэш" --data-urlencode "summary=Бусад холбооны оюутнуудыг урьж, Монгол хоол танилцуулна." --data-urlencode "location=Оюутны төв")
EID=$(echo "$loc" | grep -o 'ajillagaa/[0-9]*' | grep -o '[0-9]*'); echo "  event #$EID"
has "media member created event" "$loc" "ok=created"
hasnt "draft not on public site" "$(curl -s -H "$P" $B/uil-ajillagaa)" "Монгол хоолны үдэш"
has "organising дарга can add a task" "$(post $J/gadaad.jar /uil-ajillagaa/$EID -d action=add_task -d dept=gadaad -d due=2026-10-20 --data-urlencode "title=Урилга тараах")" "ok=created"
has "a plain member cannot add tasks" "$(post $J/dotood2.jar /uil-ajillagaa/$EID -d action=add_task --data-urlencode "title=x")" "err=denied"
TID=$(get $J/gadaad.jar /uil-ajillagaa/$EID | grep -o 'name="task" value="[0-9]*"' | head -1 | grep -o '[0-9]*')
has "member volunteers (Би хийнэ)" "$(post $J/dotood2.jar /uil-ajillagaa/$EID -d action=take -d task=$TID)" "ok=taken"
pg=$(get $J/gadaad.jar /uil-ajillagaa/$EID)
has "assignee appears in last column with ✋" "$pg" "Э. Билгүүн"
has "…marked as volunteered" "$pg" "Сайн дураар авсан"
AID=$(echo "$pg" | grep -o 'name="assignment" value="[0-9]*"' | head -1 | grep -o '[0-9]*')
has "unrelated дарга can't mark it done" "$(post $J/dotood.jar /uil-ajillagaa/$EID -d action=done -d assignment=$AID)" "err=denied"
has "board can't mark it done" "$(post $J/board.jar /uil-ajillagaa/$EID -d action=done -d assignment=$AID)" "err=denied"
has "assignee marks done" "$(post $J/dotood2.jar /uil-ajillagaa/$EID -d action=done -d assignment=$AID)" "ok=done"
has "media publishes" "$(post $J/media2.jar /uil-ajillagaa/$EID -d action=publish)" "ok=published"
pub=$(curl -s -H "$P" $B/uil-ajillagaa)
has "published event on public site" "$pub" "Монгол хоолны үдэш"
hasnt "seed draft still hidden" "$pub" "Цинхуагийн"
pd=$(curl -s -H "$P" $B/uil-ajillagaa/$EID | tr -d '\n' | sed 's/<[^>]*>//g')
has "public detail shows publisher" "$pd" "Нийтэлсэн: Ц. Мөнхжин"
check "public detail of a draft → 404" "$(curl -s -o /dev/null -w '%{http_code}' -H "$P" $B/uil-ajillagaa/3)" 404

echo "── photos"
echo "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzqiiivMPuQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/9k=" | base64 -d > $J/p.jpg   # tiny valid JPEG
loc=$(curl -s -o /dev/null -w "%{redirect_url}" -b $J/media.jar -H "$S" -H "$O" -F action=photo -F "file=@$J/p.jpg;type=image/jpeg" -F "caption=Туршилт" $B/uil-ajillagaa/2)
has "media uploads a photo" "$loc" "ok=photo"
MID=$(get $J/media.jar /uil-ajillagaa/2 | grep -o '/media/[A-Za-z0-9_-]*' | head -1)
check "photo served publicly" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' -H "$P" $B$MID)" "200 image/jpeg"
has "photo is edge-cacheable forever" "$(curl -s -D - -o /dev/null -H "$P" $B$MID)" "immutable"
echo "not an image" > $J/fake.jpg
has "a fake .jpg is rejected" "$(curl -s -o /dev/null -w "%{redirect_url}" -b $J/media.jar -H "$S" -H "$O" -F action=photo -F "file=@$J/fake.jpg;type=image/jpeg" $B/uil-ajillagaa/2)" "err=invalid"
has "non-media cannot upload" "$(curl -s -o /dev/null -w "%{redirect_url}" -b $J/dotood.jar -H "$S" -H "$O" -F action=photo -F "file=@$J/p.jpg;type=image/jpeg" $B/uil-ajillagaa/2)" "err=denied"
has "past event shows cover publicly" "$(curl -s -H "$P" $B/uil-ajillagaa)" "/media/"

echo "── official stamp"
check "settings: President only" "$(code $J/president.jar /tohirgoo)" 200
check "…not the board" "$(code $J/board.jar /tohirgoo)" 404
check "…not the maintainer" "$(code $J/dev.jar /tohirgoo)" 404
check "…and a дарга cannot post to it" "$(curl -s -o /dev/null -w '%{http_code}' -b $J/legal.jar -H "$S" -H "$O" -X POST -F action=stamp -F "file=@$J/p.jpg;type=image/jpeg" $B/tohirgoo)" 404
echo "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABs0lEQVR42u1bwRECMQg8qMEirMgircgi7EFfzjiOehAWQnR55wK7B4SEZNsolL8WqVR2PhxvlnGn60V+ggAr4JmESFfQVWTIKsCziJCOsV2ZKyQTOOovZeqRDKOyklaGTkEaUrV8IfXrauC/6RpJxBIFXwk8wyZdGfwnGzyeINXgszL6qI1SAX60SELo2ZvDTYDHqBGDooR77U0z5vlbhFtHqshv3woaPAJ4dE6P7YqMxwzwr3NZ8kl4GRxJWlngR0mwYlLU36+oDTLsUGSMVhRGDx2o8weNLiOV4L0kvNr0brxufy66iutnhQI9AFX2dpW9PKAruj8yDBgCJIAEkAASQAJIwPxd2axaRL27p9Vkr7plCHQ6nJhRitMDvLunDl5g/fuW3S3EAypJQO9C1aMUPTaa0RFj1XKI4D14yCAh2ncId4a8HRkkCYjW2CdhczRaSaEJbNUeRxgUCYcWFyRQJHjrCsS8kCsyGSRULI/w5mj0NlZH8C4P2ANd7Q0oO9ylMPKW5mzwQx5gAfzzl6WzM3qlHj6YmLFTQ27B2xBQRUTbR1OZZCz1bK5LbFMoFJPcAV19sGmRciE2AAAAAElFTkSuQmCC" | base64 -d > $J/stamp.png
has "a fake image is refused" "$(curl -s -o /dev/null -w "%{redirect_url}" -b $J/president.jar -H "$S" -H "$O" -F action=stamp -F "file=@$J/fake.jpg;type=image/jpeg" $B/tohirgoo)" "err=image"
has "President uploads the stamp" "$(curl -s -o /dev/null -w "%{redirect_url}" -b $J/president.jar -H "$S" -H "$O" -F action=stamp -F "file=@$J/stamp.png;type=image/png" $B/tohirgoo)" "ok=stamp"
check "stamp is served to logged-in staff" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' -b $J/dotood2.jar -H "$S" $B/tamga)" "200 image/png"
has "…and never stored in any cache" "$(curl -s -D - -o /dev/null -b $J/dotood2.jar -H "$S" $B/tamga)" "no-store"
has "…not without a login" "$(curl -s -o /dev/null -w '%{redirect_url}' -H "$S" $B/tamga)" "/nevtreh"
check "…not on the public host" "$(curl -s -o /dev/null -w '%{http_code}' -H "$P" $B/tamga)" 404
SID=$(get $J/president.jar /tohirgoo | grep -o 'tamga?v=[A-Za-z0-9_-]*' | head -1 | cut -d= -f2)
check "…and not through the public photo route" "$(curl -s -o /dev/null -w '%{http_code}' -H "$P" $B/media/$SID)" 404
has "the President-approved letter now carries the stamp" "$(get $J/dotood2.jar /barimt/$RID/hevleh)" "/tamga?v="
pr=$(get $J/president.jar /barimt/3/hevleh)
hasnt "a report approved by a дарга gets no stamp" "$pr" "/tamga?v="
has "…and is signed by the department's members" "$pr" 's-title">Хэлтсийн гишүүд'
has "…each of them by name" "$pr" 's-name">Ц. Мөнхжин'
hasnt "the unapproved amendment gets no stamp" "$(get $J/legal.jar /barimt/$DID/hevleh)" "/tamga?v="
has "audit log shows the stamp change" "$(get $J/president.jar /burtgel)" "Тамга сольсон"
has "President removes the stamp" "$(post $J/president.jar /tohirgoo -d action=remove_stamp)" "ok=removed"
hasnt "…and it is gone from the print" "$(get $J/dotood2.jar /barimt/$RID/hevleh)" "/tamga?v="
check "…and from /tamga" "$(code $J/dotood2.jar /tamga)" 404

echo "── participation report"
pg=$(get $J/president.jar /oroltsoo)
has "President sees everyone" "$pg" "Г. Анударь"
has "…including people with zero jobs" "$pg" "Д. Номин"
pg=$(get $J/dotood2.jar /oroltsoo)
has "member sees own history" "$pg" "Миний оролцоо"
hasnt "member doesn't see others" "$pg" "Д. Номин"
hasnt "member can't peek via ?user=" "$(get $J/dotood2.jar '/oroltsoo?user=2')" "Д. Номин"

echo "── members, invites, renewal"
pg=$(curl -s -b $J/president.jar -H "$S" -H "$O" -X POST -d "action=invite&student_id=2501110099&role=member&dept=surgalt" --data-urlencode "name=Н. Туршилт" $B/gishuud)
LINK=$(echo "$pg" | grep -o 'value="http://dep.localhost:4321/urilga/[^"]*"' | cut -d'"' -f2); TOK=${LINK##*/}
has "President gets a one-time invite link" "$LINK" "/urilga/"
has "a plain дарга cannot invite" "$(post $J/dotood.jar /gishuud -d action=invite -d student_id=1234567 -d role=member -d dept=dotood -d name=x)" "err=denied"
has "deputy (Legal) can invite a member" "$(curl -s -b $J/legal.jar -H "$S" -H "$O" -X POST -d "action=invite&student_id=2501110098&role=member&dept=dotood&name=Deputy+Test" $B/gishuud)" "Урилга үүслээ"
has "deputy cannot invite board" "$(curl -s -b $J/legal.jar -H "$S" -H "$O" -X POST -d "action=invite&student_id=2501110097&role=board&dept=udirdlaga&name=x" $B/gishuud)" "Энэ эрхийг олгох боломжгүй"
check "invite page opens without login" "$(curl -s -o /dev/null -w '%{http_code}' -H "$S" $B/urilga/$TOK)" 200
has "a school address is accepted" "$(curl -s -o /dev/null -w '%{redirect_url}' -H "$S" -H "$O" -X POST -d "action=email&email=2600000001@stu.pku.edu.cn" $B/urilga/$TOK)" "step=code"
rm -f $J/new.jar
curl -s -c $J/new.jar -b $J/new.jar -H "$S" -H "$O" -o /dev/null -X POST -d "action=email&email=new.person@demo.test" $B/urilga/$TOK
C=$(curl -s -c $J/new.jar -b $J/new.jar -H "$S" "$B/urilga/$TOK?step=code" | grep -o 'num[^>]*>[0-9]\{6\}' | grep -o '[0-9]\{6\}')
has "invitee verifies and is logged in" "$(curl -s -o /dev/null -w "%{redirect_url}" -c $J/new.jar -b $J/new.jar -H "$S" -H "$O" -X POST -d "action=verify&code=$C" $B/urilga/$TOK)" "ok=created"
has "new member lands on their dashboard" "$(get $J/new.jar /)" "Туршилт"
has "link is dead after use" "$(curl -s -H "$S" $B/urilga/$TOK)" "Урилга хүчингүй"
has "President sees who claimed with which email" "$(get $J/president.jar /gishuud)" "new.person@demo.test"
check "renewal page for President" "$(code $J/president.jar /gishuud/shine-jil)" 200
has "renewal page refused to a дарга" "$(curl -s -o /dev/null -w '%{redirect_url}' -b $J/dotood.jar -H "$S" $B/gishuud/shine-jil)" "err=denied"
NEWID=$(get $J/president.jar /gishuud | grep -o 'href="/gishuud/[0-9]*"' | grep -o '[0-9]*' | sort -n | tail -1)
has "President removes the new member" "$(post $J/president.jar /gishuud -d action=remove -d user=$NEWID)" "ok=removed"
has "removed member is logged out instantly" "$(curl -s -o /dev/null -w '%{redirect_url}' -b $J/new.jar -H "$S" $B/)" "/nevtreh"
has "President cannot remove themselves" "$(post $J/president.jar /gishuud -d action=remove -d user=1)" "err=denied"

echo "── member pages"
pg=$(get $J/president.jar '/gishuud/bichig?id=all&date=2026-09-26')
has "duty letters: one for each head" "$pg" "ХЭЛТСИЙН ДАРГЫН ҮҮРЭГ"
has "…each member" "$pg" "ХЭЛТСИЙН ГИШҮҮНИЙ ҮҮРЭГ"
has "…and the President" "$pg" "ХОЛБООНЫ ТЭРГҮҮНИЙ ҮҮРЭГ"
has "…dated for the Их Хуралдаан" "$pg" "2026 оны 9 дүгээр сарын 26"
hasnt "…but not for the board" "$pg" "Д. Номин"
has "a member prints their own letter" "$(get $J/dotood2.jar /gishuud/bichig)" "Э. Билгүүн"
check "…but not everyone's" "$(code $J/dotood2.jar '/gishuud/bichig?id=all')" 404
check "…nor someone else's" "$(code $J/dotood2.jar '/gishuud/bichig?id=3')" 404
has "an invite without a student ID is fine" "$(curl -s -b $J/president.jar -H "$S" -H "$O" -X POST -d "action=invite&student_id=&role=member&dept=media" --data-urlencode "name=Б. Эсэншихэр" $B/gishuud)" "Урилга үүслээ"
has "…but a malformed one is refused" "$(curl -s -b $J/president.jar -H "$S" -H "$O" -X POST -d "action=invite&student_id=12ab&role=member&dept=media" --data-urlencode "name=x" $B/gishuud)" "зөвхөн тооноос"
check "a member opens their own page" "$(code $J/dotood2.jar /gishuud/4)" 200
check "…but not someone else's" "$(code $J/dotood2.jar /gishuud/3)" 404
has "President changes an e-mail" "$(post $J/president.jar /gishuud -d action=email -d user=6 -d back=/gishuud/6 --data-urlencode email=surgalt.new@demo.test)" "ok=saved"
has "…and it shows in the list" "$(get $J/president.jar /gishuud)" "surgalt.new@demo.test"
has "an e-mail already in use is refused" "$(post $J/president.jar /gishuud -d action=email -d user=6 -d back=/gishuud/6 --data-urlencode email=board@demo.test)" "err=email_taken"
has "a дарга cannot change e-mails" "$(post $J/dotood.jar /gishuud -d action=email -d user=4 --data-urlencode email=x@demo.test)" "err=denied"
has "'my documents' shows my own" "$(get $J/dotood2.jar '/barimt?view=mine')" "Танхим ашиглах"
hasnt "…and not other people's" "$(get $J/dotood2.jar '/barimt?view=mine')" "Нээлтийн уулзалтын тайлан"
has "nav shows the waiting count to the President" "$(get $J/president.jar /)" 'class="count hot"'

echo "── audit & hosts"
check "audit log: President" "$(code $J/president.jar /burtgel)" 200
check "audit log: maintainer" "$(code $J/dev.jar /burtgel)" 200
check "audit log hidden from members" "$(code $J/dotood2.jar /burtgel)" 404
has "audit recorded the approval" "$(get $J/president.jar /burtgel)" "Баталсан"
check "public host: /dep is 404" "$(curl -s -o /dev/null -w '%{http_code}' -H "$P" $B/dep/barimt)" 404
check "public home renders" "$(curl -s -o /dev/null -w '%{http_code}' -H "$P" $B/)" 200
has "staff pages are noindex + no-store" "$(curl -s -D - -o /dev/null -b $J/president.jar -H "$S" $B/)" "no-store"
check "logout" "$(curl -s -o /dev/null -w '%{http_code}' -b $J/board.jar -H "$S" -H "$O" -X POST $B/gar)" 302

echo "── public site"
pub(){ curl -s -H "$P" "$B$1"; }
for pg in / /taniltsuulga /udirdlaga /uil-ajillagaa /shine-oyutan /holboo-barih; do
  check "public $pg renders" "$(curl -s -o /dev/null -w '%{http_code}' -H "$P" $B$pg)" 200
done
has "nav lists all five pages" "$(pub /)" "Удирдлагын баг"
has "about page shows the goals" "$(pub /taniltsuulga)" "Үндсэн дүрэм"
has "team page lists the President" "$(pub /udirdlaga)" "Тэмүүлэн"
has "team page lists members" "$(pub /udirdlaga)" "Билгүүн"
hasnt "maintainer is not on the team page" "$(pub /udirdlaga)" "Техникийн"
has "contact page has the email" "$(pub /holboo-barih)" "pku_mongolia@163.com"
hasnt "no Mongolian script in the title band" "$(pub /)" "band-script"
has "footer shows the Chinese name" "$(pub /)" "北京大学蒙古国留学生学生会"
has "about page: the President's wording" "$(pub /taniltsuulga)" "Жилээс жилд өсөж дэвшинэ"
has "about page: the yearly calendar from the constitution" "$(pub /taniltsuulga)" "Намрын улирал, 2-р долоо хоног"
has "newcomer guide: the two deadlines" "$(pub /shine-oyutan)" "24 цагт"
has "newcomer guide: in the menu" "$(pub /)" 'href="/shine-oyutan"'
has "contact page: the Gmail address" "$(pub /holboo-barih)" "pkumongolia@gmail.com"
has "about page links the full constitution" "$(pub /taniltsuulga)" 'href="/files/undsen-durem-2025-11-08.pdf"'
has "…and so does every page's footer" "$(pub /)" "Үндсэн дүрэм (PDF)"
check "the constitution PDF is served to everyone" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' -H "$P" $B/files/undsen-durem-2025-11-08.pdf)" "200 application/pdf"
has "member hides themselves" "$(post $J/dotood2.jar /gishuud -d action=public_off -d user=4)" "ok=saved"
hasnt "…and is gone from the team page" "$(pub /udirdlaga)" "Билгүүн"
has "other dept head cannot toggle them" "$(post $J/gadaad.jar /gishuud -d action=public_on -d user=4)" "err=denied"
has "member shows themselves again" "$(post $J/dotood2.jar /gishuud -d action=public_on -d user=4)" "ok=saved"
has "…and is back" "$(pub /udirdlaga)" "Билгүүн"

echo; echo "RESULT: $pass passed, $fail failed"
