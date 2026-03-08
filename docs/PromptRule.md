# Prompt Rule for Shoukaku Backend

Tai lieu nay la bo rule de prompt Copilot/AI khi lam viec trong repo `shoukaku-backend`.
Muc tieu: prompt ro rang, thay doi nho, test du, va khong pha vo shard-safe architecture.

## 1) Nguyen tac vang

1. Luon noi ro *pham vi* truoc khi yeu cau sua code.
2. Yeu cau AI doc file lien quan truoc khi sua.
3. Uu tien thay doi nho, khong refactor lon neu chua duoc yeu cau.
4. Moi thay doi phai co cach verify (build/test/log).
5. Neu co rui ro shard-safe, bat buoc neu ro tac dong.
6. Neu khong chac, yeu cau AI dua ra gia thuyet + cach check thay vi doan.

## 2) Context toi thieu can dua trong prompt

Khi giao task, nen kem cac thong tin sau:

- Muc tieu: ban muon sua gi, expected behavior la gi.
- File scope: danh sach file duoc phep sua.
- Non-goals: nhung gi khong duoc dong vao.
- Constraints: coding style, naming, backward compatibility.
- Validation: lenh can chay (`npm run build`, test cu the, docker logs, ...).

## 3) Prompt template chung (copy/paste)

```md
Task: <mo ta ngan gon>

Goal:
- <ket qua cuoi cung>

Scope (allowed files):
- <file 1>
- <file 2>

Out of scope:
- <dieu khong duoc sua>

Requirements:
- <rule 1>
- <rule 2>

Validation:
- Run: npm run build
- Run: npm test -- <test pattern neu can>
- Show: changed files + ly do

Output format:
1. What changed
2. Why
3. Risks
4. Commands run + ket qua tom tat
```

## 4) Prompt theo tung loai cong viec

### A. Fix bug nho

```md
Doc va sua bug trong cac file sau: <file list>.
Yeu cau:
- Chi sua toi da <N> file.
- Khong doi public behavior ngoai bug can fix.
- Them/Cap nhat test de cover bug.

Sau khi sua:
- Chay test lien quan.
- Tom tat root cause trong 3-5 dong.
```

### B. Refactor an toan

```md
Refactor nho de giam duplicate trong <file/module>.
Constraints:
- Khong doi API surface.
- Khong doi command output text.
- Khong doi env vars.

Bat buoc:
- Tach thanh commit-size changes (co the lam theo buoc).
- Neu gap rui ro lon, dung lai va bao options truoc khi lam tiep.
```

### C. Review code (mode danh gia)

```md
Hay review cac file sau theo thu tu muc do nghiem trong:
- Bugs
- Behavioral regression risk
- Missing tests
- Performance/shard-safety risk

Yeu cau output:
- Liet ke finding co file:line
- Neu khong co bug, noi ro residual risk
- Khong can viet lai toan bo code
```

### D. Them command/service moi

```md
Them tinh nang moi: <feature name>.
Architecture constraints:
- Command layer chi xu ly interaction + validation nhe.
- Business logic nam trong service.
- State can shard-safe (uu tien Redis/CacheService, tranh in-memory Map neu co cross-shard flow).

Done khi:
- Dang ky command/event day du (neu can)
- Co test hoac it nhat checklist test tay ro rang
- Build pass
```

## 5) Rule rieng cho repo nay

1. Tranh them `type X = any` moi; uu tien type ro rang hoac `unknown` + narrowing.
2. Neu sua music/moderation state, kiem tra shard-safe (Redis/CacheService).
3. Han che import cheo sai layer (service <-> handler).
4. Khong hardcode secret/token/ID vao code.
5. Comment chi de giai thich *why*, khong mo ta lai *what*.
6. Uu tien sua theo module nho, de review nhanh.

## 6) Anti-pattern khi prompt

- "Sua het cho toi" (pham vi mo ho).
- "Refactor toan bo" khi chua co acceptance criteria.
- "Lam nhanh, bo qua test".
- "Tu do doi architecture" ma khong neu gioi han.
- Dua input thieu file scope va thieu expected result.

## 7) Definition of Done (DoD)

Mot task duoc xem la xong khi co du:

1. Code thay doi dung scope.
2. Build/test lien quan pass (hoac neu khong chay duoc thi neu ly do).
3. Co tom tat risk va impact.
4. Co danh sach file da sua.
5. Khong tao regression ro rang trong behavior hien tai.

## 8) Mau prompt toi uu cho ban (ban co the dung ngay)

```md
Ban hay sua task sau trong repo shoukaku-backend.

Task:
<dien task>

Scope chi gom:
- <file A>
- <file B>

Khong duoc sua:
- <file/folder khac>

Acceptance criteria:
- <criteria 1>
- <criteria 2>

Validation bat buoc:
- npm run build
- npm test -- <pattern>

Output toi muon:
1) Root cause
2) Patch summary
3) Risks
4) Lenh da chay va ket qua
```

## 9) Lich su cap nhat

- 2026-03-09: Tao moi PromptRule.md cho workflow prompt trong du an.
