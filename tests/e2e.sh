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
has "number assigned on submit" "$pg" "МОХ-ДХ/2026-2027/002"
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
has "approved record is locked" "$(curl -s -o /dev/null -w '%{redirect_url}' -b $J/dotood.jar -H "$S" $B/barimt/$RID/zasah)" "err=denied"

echo "── records: the department wall, open reading"
check "other dept can READ approved record" "$(code $J/gadaad.jar /barimt/$RID)" 200
check "maintainer can read" "$(code $J/dev.jar /barimt/$RID)" 200
check "dept-only draft hidden from other dept" "$(code $J/gadaad.jar /barimt/4)" 404
check "dept-only draft hidden from board (draft)" "$(code $J/board.jar /barimt/4)" 404
check "dept-only draft visible to its author" "$(code $J/legal.jar /barimt/4)" 200
pg=$(curl -s -b $J/dotood2.jar -H "$S" -H "$O" -X POST -d "type=tailan&dept=gadaad&visibility=staff&then=save" --data-urlencode "title=x" --data-urlencode "f_period=x" --data-urlencode "f_summary=x" $B/barimt/shine)
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
has "PKU email refused" "$(curl -s -H "$S" -H "$O" -X POST -d "action=email&email=x@stu.pku.edu.cn" $B/urilga/$TOK)" "хувийн и-мэйл"
rm -f $J/new.jar
curl -s -c $J/new.jar -b $J/new.jar -H "$S" -H "$O" -o /dev/null -X POST -d "action=email&email=new.person@demo.test" $B/urilga/$TOK
C=$(curl -s -c $J/new.jar -b $J/new.jar -H "$S" "$B/urilga/$TOK?step=code" | grep -o 'num[^>]*>[0-9]\{6\}' | grep -o '[0-9]\{6\}')
has "invitee verifies and is logged in" "$(curl -s -o /dev/null -w "%{redirect_url}" -c $J/new.jar -b $J/new.jar -H "$S" -H "$O" -X POST -d "action=verify&code=$C" $B/urilga/$TOK)" "ok=created"
has "new member lands on their dashboard" "$(get $J/new.jar /)" "Туршилт"
has "link is dead after use" "$(curl -s -H "$S" $B/urilga/$TOK)" "Урилга хүчингүй"
has "President sees who claimed with which email" "$(get $J/president.jar /gishuud)" "new.person@demo.test"
check "renewal page for President" "$(code $J/president.jar /gishuud/shine-jil)" 200
has "renewal page refused to a дарга" "$(curl -s -o /dev/null -w '%{redirect_url}' -b $J/dotood.jar -H "$S" $B/gishuud/shine-jil)" "err=denied"
NEWID=$(get $J/president.jar /gishuud | grep -o 'name="user" value="[0-9]*"' | grep -o '[0-9]*' | sort -n | tail -1)
has "President removes the new member" "$(post $J/president.jar /gishuud -d action=remove -d user=$NEWID)" "ok=removed"
has "removed member is logged out instantly" "$(curl -s -o /dev/null -w '%{redirect_url}' -b $J/new.jar -H "$S" $B/)" "/nevtreh"
has "President cannot remove themselves" "$(post $J/president.jar /gishuud -d action=remove -d user=1)" "err=denied"

echo "── audit & hosts"
check "audit log: President" "$(code $J/president.jar /burtgel)" 200
check "audit log: maintainer" "$(code $J/dev.jar /burtgel)" 200
check "audit log hidden from members" "$(code $J/dotood2.jar /burtgel)" 404
has "audit recorded the approval" "$(get $J/president.jar /burtgel)" "Баталсан"
check "public host: /dep is 404" "$(curl -s -o /dev/null -w '%{http_code}' -H "$P" $B/dep/barimt)" 404
check "public home renders" "$(curl -s -o /dev/null -w '%{http_code}' -H "$P" $B/)" 200
has "staff pages are noindex + no-store" "$(curl -s -D - -o /dev/null -b $J/president.jar -H "$S" $B/)" "no-store"
check "logout" "$(curl -s -o /dev/null -w '%{http_code}' -b $J/board.jar -H "$S" -H "$O" -X POST $B/gar)" 302

echo; echo "RESULT: $pass passed, $fail failed"
