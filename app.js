import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc, addDoc, updateDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA1a7mgcWNmmf0RkTpFYShtiSvaH9Yr6oI",
  authDomain: "robo-mart-a70b4.firebaseapp.com",
  projectId: "robo-mart-a70b4",
  storageBucket: "robo-mart-a70b4.firebasestorage.app",
  messagingSenderId: "301073621451",
  appId: "1:301073621451:web:bdc791e232a945a450964e",
  measurementId: "G-P0SNPL19K6"
};

// IMPORTANT: Replace this with RoboMart's business WhatsApp number.
const ROBOMART_WHATSAPP_NUMBER = "919420157827";

// Cloudflare Worker used to securely create Razorpay Payment Links.
const PAYMENT_WORKER_URL = "https://robomart-payment.ajay-watchout.workers.dev";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let products = [];
let cart = JSON.parse(localStorage.getItem("robomart_cart") || "[]");
let activeCategory = "";
let searchMode = false;

const money = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[c]));

async function loadProducts() {
  const grid = document.getElementById("productGrid");
  grid.innerHTML = '<div class="empty">Loading products...</div>';
  try {
    const snap = await getDocs(query(collection(db, "products"), where("active", "==", true)));
    products = snap.docs.map(d => ({id:d.id, ...d.data()}));
    products.sort((a,b) => String(a.name||"").localeCompare(String(b.name||"")));
    displayProducts();
  } catch (e) {
    console.error(e);
    grid.innerHTML = '<div class="empty"><strong>Products could not be loaded.</strong><br>Check Firebase connection and Firestore rules.</div>';
  }
}


function handleSearchInput(){
  const q = document.getElementById("search").value.toLowerCase().trim();

  // While typing, keep the normal page visible and show Google-style suggestions.
  if(!q){
    hideSearchSuggestions();
    if(searchMode){
      exitSearchMode();
    }
    displayProducts();
    return;
  }

  activeCategory = "";
  showSearchSuggestions(q);
  displayProducts();
}

function handleSearchKeydown(event){
  if(event.key === "Enter"){
    event.preventDefault();
    submitSearch();
  }else if(event.key === "Escape"){
    hideSearchSuggestions();
  }
}

function showSearchSuggestions(q){
  const box = document.getElementById("searchSuggestions");
  if(!box) return;

  const matches = products.filter(p =>
    `${p.name||""} ${p.category||""} ${p.description||""}`
      .toLowerCase().includes(q)
  ).slice(0,6);

  if(!matches.length){
    box.innerHTML = '<div class="search-empty">No matching products found.</div>';
    box.classList.add("show");
    return;
  }

  box.innerHTML = matches.map(p => {
    const image = p.image || "";
    const img = image
      ? `<img src="${esc(image)}" alt="" onerror="this.style.display='none'">`
      : `<div style="width:42px;height:42px;display:grid;place-items:center;border:1px solid #eee;border-radius:5px">📦</div>`;
    return `<button class="search-suggestion" onclick="selectSearchSuggestion('${String(p.id).replaceAll("'","\\'")}')">
      ${img}
      <span class="suggest-info">
        <strong>${esc(p.name || "Unnamed Product")}</strong>
        <small>${esc(p.category || "Robotics Component")} · ${money(p.price)}</small>
      </span>
    </button>`;
  }).join("");

  box.classList.add("show");
}

function selectSearchSuggestion(id){
  const p = products.find(x => String(x.id) === String(id));
  if(!p) return;

  document.getElementById("search").value = p.name || "";
  activeCategory = "";
  hideSearchSuggestions();
  enterSearchMode();
  displayProducts();
  document.getElementById("products").scrollIntoView({behavior:"smooth", block:"start"});
}

function submitSearch(){
  const q = document.getElementById("search").value.trim();
  hideSearchSuggestions();

  if(!q){
    exitSearchMode();
    displayProducts();
    return;
  }

  activeCategory = "";
  enterSearchMode();
  displayProducts();
  document.getElementById("products").scrollIntoView({behavior:"smooth", block:"start"});
}

function enterSearchMode(){
  searchMode = true;
  document.body.classList.add("search-mode");
}

function exitSearchMode(){
  searchMode = false;
  document.body.classList.remove("search-mode");
}

function hideSearchSuggestions(){
  const box = document.getElementById("searchSuggestions");
  if(box) box.classList.remove("show");
}

function displayProducts() {
  const q = document.getElementById("search").value.toLowerCase().trim();
  const list = products.filter(p =>
    (!activeCategory || p.category === activeCategory) &&
    (!q || `${p.name||""} ${p.category||""} ${p.description||""}`.toLowerCase().includes(q))
  );
  const grid = document.getElementById("productGrid");
  if (!list.length) {
    grid.innerHTML = '<div class="empty">No products found. Try another search.</div>';
    return;
  }
  grid.innerHTML = list.map(p => {
    const stock = Number(p.stock || 0);
    const image = p.image || "";
    return `<article class="product">
      <button class="product-img" style="width:100%;border:0;cursor:pointer" onclick="openProduct('${String(p.id).replaceAll("'","\\'")}')" aria-label="View ${esc(p.name)}">${image
        ? `<img src="${esc(image)}" alt="${esc(p.name)}" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none';this.parentElement.insertAdjacentText('beforeend','📦')">`
        : "📦"}</button>
      <div class="product-info">
        <button onclick="openProduct('${String(p.id).replaceAll("'","\\'")}')" style="border:0;background:none;padding:0;text-align:left;width:100%;cursor:pointer"><div class="product-name">${esc(p.name || "Unnamed Product")}</div></button>
        <div class="product-desc">${esc(p.description || "")}</div>
        <div class="price">${money(p.price)}</div>
        <div class="stock">${stock > 0 ? "● Available for local order" : "● Currently out of stock"}</div>
        <button class="add" ${stock<=0 ? "disabled" : ""} onclick="addToCart('${String(p.id).replaceAll("'","\\'")}')">${stock>0 ? "Add to Cart" : "Out of Stock"}</button>
      </div>
    </article>`;
  }).join("");
}

function filterCategory(c){
  activeCategory=c;
  document.getElementById("search").value="";
  hideSearchSuggestions();
  exitSearchMode();
  displayProducts();
  document.getElementById("products").scrollIntoView({behavior:"smooth"});
}
function clearFilter(){
  activeCategory="";
  document.getElementById("search").value="";
  hideSearchSuggestions();
  exitSearchMode();
  displayProducts();
}

function cartData(){
  return {items: cart, updatedAt: Date.now()};
}

async function saveCartToAccount(){
  if(!currentUser) return;
  try{
    await setDoc(
      doc(db,"users",currentUser.uid,"private","cart"),
      cartData(),
      {merge:true}
    );
    localStorage.setItem("robomart_cart_owner", currentUser.uid);
  }catch(e){
    console.error("Cart sync error:",e);
    // Do not interrupt cart usage if Firestore is temporarily unavailable.
  }
}

async function ensureUserProfile(){
  if(!currentUser) return;

  const ref = doc(db,"users",currentUser.uid);
  const snap = await getDoc(ref);

  const profile = {
    name: currentUser.displayName || "",
    email: currentUser.email || "",
    updatedAt: Date.now()
  };

  // Preserve an existing WhatsApp number. Registration saves it below.
  if(snap.exists() && snap.data().whatsapp){
    profile.whatsapp = snap.data().whatsapp;
  }

  await setDoc(ref, profile, {merge:true});
}

async function loadCartFromAccount(){
  if(!currentUser) return;

  const ref=doc(db,"users",currentUser.uid,"private","cart");
  const snap=await getDoc(ref);

  const localOwner=localStorage.getItem("robomart_cart_owner");
  const localCart=Array.isArray(cart) ? cart.map(item => ({...item})) : [];
  const accountCart=(snap.exists() && Array.isArray(snap.data().items))
    ? snap.data().items.map(item => ({...item}))
    : [];

  if(localOwner === currentUser.uid){
    // This browser cart already belongs to this account. On refresh,
    // do NOT merge it with itself or quantities will double.
    cart=accountCart;
  }else{
    // No owner means this is a guest cart created before login.
    // Merge it into the customer's existing account cart.
    const merged=new Map();

    accountCart.forEach(item=>{
      merged.set(String(item.id),{
        ...item,
        qty:Number(item.qty || 1)
      });
    });

    localCart.forEach(item=>{
      const key=String(item.id);
      if(merged.has(key)){
        merged.get(key).qty += Number(item.qty || 1);
      }else{
        merged.set(key,{
          ...item,
          qty:Number(item.qty || 1)
        });
      }
    });

    cart=Array.from(merged.values()).filter(item=>item.qty>0);
  }

  localStorage.setItem("robomart_cart",JSON.stringify(cart));
  localStorage.setItem("robomart_cart_owner",currentUser.uid);
  renderCart();

  // Persist the final cart to the customer's account.
  await setDoc(
    ref,
    {items:cart,updatedAt:Date.now()},
    {merge:true}
  );
}

function saveCart(){
  localStorage.setItem("robomart_cart",JSON.stringify(cart));

  // Mark which account owns the browser cart. Guest carts have no owner.
  if(currentUser){
    localStorage.setItem("robomart_cart_owner", currentUser.uid);
    saveCartToAccount();
  }else{
    localStorage.removeItem("robomart_cart_owner");
  }

  renderCart();
}
function addToCart(id){
  const p=products.find(x=>x.id===id); if(!p || Number(p.stock||0)<=0)return;
  const item=cart.find(x=>x.id===id); item ? item.qty++ : cart.push({id,qty:1});
  saveCart();openCart();
}
function changeQty(id,d){
  const item=cart.find(x=>x.id===id);if(!item)return;
  item.qty+=d;if(item.qty<=0)cart=cart.filter(x=>x.id!==id);saveCart();
}
function getSelectedDeliveryMethod(){
  const selected=document.querySelector('input[name="deliveryMethod"]:checked');
  return selected ? selected.value : "HOME";
}

function getDeliveryCharge(){
  return getSelectedDeliveryMethod()==="HOME" ? 50 : 0;
}

function updateDeliveryTotal(){
  let itemsTotal=0;
  cart.forEach(item=>{
    const p=products.find(y=>String(y.id)===String(item.id));
    if(!p)return;
    itemsTotal += Number(p.price||0)*Number(item.qty||1);
  });

  const deliveryCharge=getDeliveryCharge();
  const total=itemsTotal+deliveryCharge;

  const itemsEl=document.getElementById("cartItemsTotal");
  const deliveryEl=document.getElementById("cartDeliveryCharge");
  const totalEl=document.getElementById("cartTotal");

  if(itemsEl)itemsEl.textContent=money(itemsTotal);
  if(deliveryEl)deliveryEl.textContent=deliveryCharge ? money(deliveryCharge) : "FREE";
  if(totalEl)totalEl.textContent=money(total);
}

function renderCart(){
  document.getElementById("cartCount").textContent=cart.reduce((s,x)=>s+x.qty,0);
  const box=document.getElementById("cartItems");

  if(!cart.length){
    box.innerHTML='<div class="empty">Your cart is empty.</div>';
    const itemsEl=document.getElementById("cartItemsTotal");
    const deliveryEl=document.getElementById("cartDeliveryCharge");
    const totalEl=document.getElementById("cartTotal");
    const deliveryBox=document.querySelector(".delivery-section");
    if(deliveryBox)deliveryBox.style.display="none";
    if(itemsEl)itemsEl.textContent="₹0";
    if(deliveryEl)deliveryEl.textContent="₹0";
    if(totalEl)totalEl.textContent="₹0";
    return;
  }

  const deliveryBox=document.querySelector(".delivery-section");
  if(deliveryBox)deliveryBox.style.display="block";

  box.innerHTML=cart.map(x=>{
    const p=products.find(y=>y.id===x.id);
    if(!p)return "";
    const sub=Number(p.price||0)*Number(x.qty||1);
    return `<div class="cart-row"><div class="cart-thumb">📦</div><div><h4>${esc(p.name)}</h4><p>${money(p.price)} each</p><div class="qty"><button onclick="changeQty('${x.id}',-1)">−</button><span>${x.qty}</span><button onclick="changeQty('${x.id}',1)">+</button></div></div><div><strong>${money(sub)}</strong><br><button class="remove" onclick="changeQty('${x.id}',-${x.qty})">Remove</button></div></div>`;
  }).join("");

  // Preserve the selected delivery method while changing quantities.
  if(!document.querySelector('input[name="deliveryMethod"]:checked')){
    const home=document.querySelector('input[name="deliveryMethod"][value="HOME"]');
    if(home)home.checked=true;
  }
  updateDeliveryTotal();
}

function openProduct(id){
  const p = products.find(x => x.id === id);
  if(!p) return;
  const stock = Number(p.stock || 0);
  const image = p.image || "";
  document.getElementById("productDetailContent").innerHTML = `
    <div class="product-detail-grid">
      <div class="product-detail-image">
        ${image
          ? `<img src="${esc(image)}" alt="${esc(p.name)}" onerror="this.style.display='none';this.parentElement.insertAdjacentHTML('beforeend','<div class=\\'product-detail-placeholder\\'>📦</div>')">`
          : `<div class="product-detail-placeholder">📦</div>`}
      </div>
      <div class="product-detail-info">
        <div class="product-detail-category">${esc(p.category || "Robotics Component")}</div>
        <h2>${esc(p.name || "Unnamed Product")}</h2>
        <div class="detail-price">${money(p.price)}</div>
        <div class="detail-stock">${stock > 0 ? "● In stock" : "● Out of stock"}</div>
        <div class="detail-description">${esc(p.description || "No product description available yet.")}</div>
        ${stock > 0 ? `
          <div class="detail-qty">
            <button onclick="detailQtyChange(-1)">−</button>
            <span id="detailQty">1</span>
            <button onclick="detailQtyChange(1)">+</button>
          </div>
          <button class="detail-add" onclick="addProductFromDetail('${String(p.id).replaceAll("'","\\\\'")}')">Add to Cart</button>
        ` : `<button class="detail-add" disabled style="opacity:.5;cursor:not-allowed">Out of Stock</button>`}
        <div class="detail-meta">
          <div><strong>Category:</strong> ${esc(p.category || "—")}</div>
          <div><strong>Availability:</strong> Local order in Ahilyanagar</div>
          <div><strong>Delivery:</strong> Home Delivery ₹50 or Office Delivery FREE</div>
        </div>
      </div>
    </div>`;
  document.getElementById("productModal").classList.add("show");
  document.body.style.overflow="hidden";
}
let detailQuantity=1;
function detailQtyChange(delta){
  detailQuantity=Math.max(1,detailQuantity+delta);
  const el=document.getElementById("detailQty");
  if(el)el.textContent=detailQuantity;
}
function addProductFromDetail(id){
  const p=products.find(x=>x.id===id);
  if(!p)return;
  const stock=Number(p.stock||0);
  const item=cart.find(x=>x.id===id);
  const current=item ? item.qty : 0;
  if(current+detailQuantity>stock){
    alert("Only "+stock+" item(s) currently available.");
    return;
  }
  if(item)item.qty+=detailQuantity;
  else cart.push({id,qty:detailQuantity});
  detailQuantity=1;
  saveCart();
  closeProduct();
  openCart();
}
function closeProduct(){
  document.getElementById("productModal").classList.remove("show");
  document.body.style.overflow="";
}


let currentUser = null;

function openAuth(tab="login"){
  clearAuthMessages();
  document.getElementById("authModal").classList.add("show");
  document.body.style.overflow="hidden";
  showAuthTab(tab);
}
function closeAuth(){
  document.getElementById("authModal").classList.remove("show");
  document.body.style.overflow="";
  clearAuthMessages();
}
let toastTimer = null;

function showToast(message, type="success"){
  const toast = document.getElementById("toast");
  if(!toast) return;

  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = "toast show " + (type === "error" ? "error" : "success");

  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}

function showAuthTab(tab){
  const login=tab==="login";
  document.getElementById("loginForm").style.display=login?"grid":"none";
  document.getElementById("registerForm").style.display=login?"none":"grid";
  document.getElementById("loginTab").classList.toggle("active",login);
  document.getElementById("registerTab").classList.toggle("active",!login);
  document.getElementById("authTitle").textContent=login?"Welcome back":"Create your RoboMart account";
  document.getElementById("authSubtitle").textContent=login?"Login securely to manage your account and orders.":"Create a free account for faster checkout and order tracking.";
  clearAuthMessages();
}
function showAuthMessage(id,message,type="error"){
  const el=document.getElementById(id);
  el.textContent=message;
  el.className="auth-message "+type;
}
function clearAuthMessages(){
  ["loginMessage","registerMessage"].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.textContent="";el.className="auth-message";}
  });
}
function friendlyAuthError(code){
  const map={
    "auth/email-already-in-use":"An account with this email already exists. Please log in.",
    "auth/invalid-email":"Please enter a valid email address.",
    "auth/weak-password":"Password should be at least 6 characters.",
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/user-not-found":"Email or password is incorrect.",
    "auth/wrong-password":"Email or password is incorrect.",
    "auth/too-many-requests":"Too many attempts. Please try again later.",
    "auth/account-exists-with-different-credential":"This email already has an account using another sign-in method. Log in with that method first.",
    "auth/network-request-failed":"Network error. Please check your internet connection."
  };
  return map[code] || "Something went wrong. Please try again.";
}

async function loginWithGoogle(){
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});

  try{
    await signInWithPopup(auth,provider);
    // Profile/cart sync is handled by onAuthStateChanged.
    showToast("Google login successful.","success");
    closeAuth();
  }catch(e){
    console.error("Google sign-in error:",e);
    let message;
    if(e.code==="auth/popup-closed-by-user") message="Google sign-in was cancelled.";
    else if(e.code==="auth/popup-blocked") message="Google popup was blocked. Allow popups for this site and try again.";
    else if(e.code==="auth/unauthorized-domain") message="This website domain is not authorized in Firebase. Add 127.0.0.1 under Authentication → Settings → Authorized domains while testing locally.";
    else if(e.code==="auth/operation-not-allowed") message="Google sign-in is not enabled in Firebase Authentication.";
    else if(e.code==="auth/network-request-failed") message="Network error. Check your internet connection.";
    else message=`Google login failed: ${e.message || "Unknown error"} [${e.code || "unknown"}]`;
    showAuthMessage("loginMessage",message);
  }
}
async function registerUser(event){
  event.preventDefault();
  const name=document.getElementById("registerName").value.trim();
  const email=document.getElementById("registerEmail").value.trim();
  const password=document.getElementById("registerPassword").value;
  const whatsapp=document.getElementById("registerWhatsapp").value.replace(/\D/g,"");
  const confirm=document.getElementById("registerConfirm").value;

  if(password!==confirm){
    showAuthMessage("registerMessage","Passwords do not match.");
    return;
  }

  if(!/^[6-9]\d{9}$/.test(whatsapp)){
    showToast("Please enter a valid 10-digit WhatsApp number.","error");
    return;
  }

  try{
    const cred=await createUserWithEmailAndPassword(auth,email,password);
    await updateProfile(cred.user,{displayName:name});
    await setDoc(
      doc(db,"users",cred.user.uid),
      {name:name,email:cred.user.email || email,whatsapp:whatsapp,updatedAt:Date.now()},
      {merge:true}
    );

    // The account exists even if the optional Firestore profile sync fails.
    try{
      await setDoc(doc(db,"users",cred.user.uid),{
        name:name,
        email:cred.user.email||"",
        createdAt:Date.now(),
        updatedAt:Date.now()
      },{merge:true});
    }catch(profileError){
      console.error("Registration profile sync:",profileError);
    }

    clearAuthMessages();
    showToast("Account created and logged in successfully.","success");
    closeAuth();
  }catch(e){
    console.error("Registration:",e);
    showAuthMessage("registerMessage",friendlyAuthError(e.code));
  }
}
async function loginUser(event){
  event.preventDefault();
  const email=document.getElementById("loginEmail").value.trim();
  const password=document.getElementById("loginPassword").value;

  clearAuthMessages();

  try{
    const cred = await signInWithEmailAndPassword(auth,email,password);
    console.log("RoboMart: email login successful:", cred.user.email);
    closeAuth();
    showToast("Logged in successfully.","success");
  }catch(e){
    console.error("RoboMart: Email login failed:",e);

    // Show a simple customer-friendly message. Never expose Firebase
    // error codes or technical details to the customer.
    if(e.code === "auth/invalid-credential" ||
       e.code === "auth/wrong-password" ||
       e.code === "auth/user-not-found"){
      showToast("Email is not registered or password is incorrect.","error");
    }else if(e.code === "auth/invalid-email"){
      showToast("Please enter a valid email address.","error");
    }else if(e.code === "auth/too-many-requests"){
      showToast("Too many login attempts. Please try again later.","error");
    }else if(e.code === "auth/network-request-failed"){
      showToast("Network error. Please check your internet connection.","error");
    }else{
      showToast("Unable to log in. Please try again.","error");
    }

    // Clear the old inline error box so only the customer-friendly toast is shown.
    clearAuthMessages();
  }
}
async function resetPassword(){
  const email=document.getElementById("loginEmail").value.trim();
  if(!email){showAuthMessage("loginMessage","Enter your email first, then click Forgot password.");return;}
  try{
    await sendPasswordResetEmail(auth,email);
    showAuthMessage("loginMessage","Password reset email sent. Check your inbox.","success");
  }catch(e){console.error(e);showAuthMessage("loginMessage",friendlyAuthError(e.code));}
}
async function logoutUser(){
  try{
    await signOut(auth);
    console.log("RoboMart: logout successful");

    cart=[];
    localStorage.removeItem("robomart_cart");
    localStorage.removeItem("robomart_cart_owner");
    renderCart();

    const menu=document.getElementById("accountMenu");
    if(menu) menu.classList.remove("show");
    clearAuthMessages();

    showToast("Logged out successfully.","success");
  }catch(e){
    console.error("RoboMart: Logout failed:",e);
    showToast(`Logout failed: ${e.message || "Please try again."}`,"error");
  }
}
async function checkAdmin(uid){
  try{
    // Admin access is controlled by a Firestore admins/{uid} document.
    const snap=await getDoc(doc(db,"admins",uid));
    return snap.exists() && snap.data().active===true;
  }catch(e){
    console.error("Admin check:",e);
    return false;
  }
}
async function updateAccountUI(user){
  currentUser=user;
  const btn=document.getElementById("accountBtn");
  const menu=document.getElementById("accountMenu");
  const adminBtn=document.getElementById("adminDashboardBtn");
  if(!user){
    btn.textContent="Login / Register";
    adminBtn.style.display="none";
    menu.classList.remove("show");
    return;
  }
  btn.textContent=(user.displayName||"Account").split(" ")[0];
  document.getElementById("accountEmail").textContent=user.email||"";
  const admin=await checkAdmin(user.uid);
  isAdminUser=admin;
  document.getElementById("accountRole").textContent=admin?"Administrator":"Customer account";
  adminBtn.style.display=admin?"block":"none";
}
function toggleAccountMenu(){
  if(!currentUser){openAuth();return;}
  document.getElementById("accountMenu").classList.toggle("show");
}

let adminOrdersUnsubscribe=null;
let isAdminUser=false;
let adminOrdersCache=[];
const TRACKING_STATUSES=[
  ["PLACED","Order Placed"],
  ["CONFIRMED","Order Confirmed"],
  ["DISPATCHED","Dispatched"],
  ["OUT_FOR_DELIVERY","Out for Delivery"],
  ["DELIVERED","Delivered"],
  ["CANCELLED","Cancelled"]
];

function normalizeTrackingStatus(value, paid=false){
  const s=String(value||"").toUpperCase();
  if(s==="PREPARING") return "DISPATCHED"; // legacy orders
  if(s==="ON_YOUR_WAY") return "OUT_FOR_DELIVERY"; // legacy compatibility
  if(s==="ORDER_CONFIRMED") return "CONFIRMED";
  if(s==="PAID" || s==="CONFIRMED") return "CONFIRMED";
  if(s==="PLACED") return "PLACED";
  if(s==="DISPATCHED") return "DISPATCHED";
  if(s==="OUT_FOR_DELIVERY") return "OUT_FOR_DELIVERY";
  if(s==="DELIVERED") return "DELIVERED";
  if(s==="CANCELLED") return "CANCELLED";
  return paid ? "CONFIRMED" : "PLACED";
}

function trackingStatusClass(status){
  return normalizeTrackingStatus(status).toLowerCase().replace(/_/g,"-");
}

function trackingStatusLabel(status){
  const normalized=normalizeTrackingStatus(status);
  const found=TRACKING_STATUSES.find(s=>s[0]===normalized);
  return found ? found[1] : normalized;
}
const ADMIN_SECTION_META={
  dashboard:["Dashboard","Robo Mart store overview"],
  orders:["Orders","Manage customer orders and delivery"],
  products:["Products","Manage the Robo Mart catalogue"],
  inventory:["Inventory","Monitor stock levels and alerts"],
  customers:["Customers","Customer accounts and order history"],
  reports:["Sales & Reports","Sales and delivery performance"],
  settings:["Store Settings","Delivery and store configuration"]
};

function closeAdmin(){
  if(adminOrdersUnsubscribe){adminOrdersUnsubscribe();adminOrdersUnsubscribe=null;}
  const p=document.getElementById("adminPage");
  if(p)p.classList.remove("show");
  document.body.classList.remove("admin-mode");
  document.body.style.overflow="";
}
function showAdminSection(section){
  if(!isAdminUser)return;
  document.querySelectorAll(".admin-section").forEach(el=>el.classList.remove("active"));
  document.querySelectorAll(".admin-nav button[data-admin-section]").forEach(el=>el.classList.remove("active"));
  document.getElementById("adminSection-"+section)?.classList.add("active");
  document.querySelector(`.admin-nav button[data-admin-section="${section}"]`)?.classList.add("active");
  const meta=ADMIN_SECTION_META[section]||ADMIN_SECTION_META.dashboard;
  const title=document.getElementById("adminPageTitle"),sub=document.getElementById("adminPageSub");
  if(title)title.textContent=meta[0];
  if(sub)sub.textContent=meta[1];
  if(section==="orders")filterAdminOrders();
}
async function openAdmin(){
  if(!currentUser || !isAdminUser){showToast("Admin access required.","error");return;}
  document.getElementById("accountMenu")?.classList.remove("show");
  const p=document.getElementById("adminPage");
  if(!p)return;
  p.classList.add("show");
  document.body.classList.add("admin-mode");
  document.body.style.overflow="hidden";
  const pill=document.getElementById("adminUserPill"); if(pill)pill.textContent=currentUser.email||"Administrator";
  showAdminSection("dashboard");
  await loadAdminOrders();
}
async function loadAdminOrders(){
  const content=document.getElementById("adminOrdersContent");
  const recent=document.getElementById("adminRecentOrders");
  if(content)content.innerHTML='<div class="orders-loading">Loading orders...</div>';
  if(recent)recent.innerHTML='<div class="orders-loading">Loading orders...</div>';
  try{
    const idToken=await currentUser.getIdToken();
    const res=await fetch(PAYMENT_WORKER_URL+"/admin/orders",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken})
    });
    const data=await res.json();
    if(!res.ok || !data.success) throw new Error(data.error||"Unable to load admin orders.");
    adminOrdersCache=(data.orders||[]).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    renderAdminDashboardStats(adminOrdersCache);
    renderAdminRecentOrders(adminOrdersCache.slice(0,5));
    renderAdminOrders(adminOrdersCache);
  }catch(e){
    console.error(e);
    if(content)content.innerHTML='<div class="orders-empty">Unable to load orders.</div>';
    if(recent)recent.innerHTML='<div class="orders-empty">Unable to load orders.</div>';
    showToast(e.message||"Unable to load admin orders.","error");
  }
}
function renderAdminDashboardStats(orders){
  const today=new Date();
  const isToday=o=>{const d=new Date(o.createdAt||0);return d.toDateString()===today.toDateString();};
  const paid=o=>String(o.paymentStatus||"").toUpperCase()==="PAID";
  const total=orders.reduce((sum,o)=>sum+(Number(o.totalAmount)||0),0);
  const todaySales=orders.filter(o=>isToday(o)&&paid(o)).reduce((sum,o)=>sum+(Number(o.totalAmount)||0),0);
  const pending=orders.filter(o=>!paid(o)).length;
  const placed=orders.filter(o=>normalizeTrackingStatus(o.trackingStatus,paid(o))==="PLACED").length;
  const confirmed=orders.filter(o=>normalizeTrackingStatus(o.trackingStatus,paid(o))==="CONFIRMED").length;
  const dispatched=orders.filter(o=>normalizeTrackingStatus(o.trackingStatus,paid(o))==="DISPATCHED").length;
  const out=orders.filter(o=>normalizeTrackingStatus(o.trackingStatus,paid(o))==="OUT_FOR_DELIVERY").length;
  const delivered=orders.filter(o=>normalizeTrackingStatus(o.trackingStatus,paid(o))==="DELIVERED").length;
  const cancelled=orders.filter(o=>normalizeTrackingStatus(o.trackingStatus,paid(o))==="CANCELLED").length;
  const cards=[
    ["Today's Sales",money(todaySales),"Paid orders today"],
    ["Total Orders",orders.length,"All orders"],
    ["Pending Payments",pending,"Payment required"],
    ["Order Placed",placed,"Awaiting confirmation"],
    ["Order Confirmed",confirmed,"Confirmed orders"],
    ["Dispatched",dispatched,"Dispatched orders"],
    ["Out for Delivery",out,"Out for delivery"],
    ["Delivered",delivered,"Delivered orders"],
    ["Cancelled",cancelled,"Cancelled orders"]
  ];
  const grid=document.getElementById("adminStatsGrid");if(!grid)return;
  grid.innerHTML=cards.map(c=>`<div class="admin-stat"><div class="admin-stat-label">${esc(c[0])}</div><div class="admin-stat-value">${esc(String(c[1]))}</div><div class="admin-stat-note">${esc(c[2])}</div></div>`).join("");
}
function renderAdminRecentOrders(orders){
  // Dashboard no longer renders a separate Recent Orders list.
}

function adminStatusBadge(status, paid=false){
  const normalized=normalizeTrackingStatus(status,paid);
  return `<span class="admin-status-badge status-${trackingStatusClass(normalized)}">
    <span class="status-dot"></span>${esc(trackingStatusLabel(normalized))}
  </span>`;
}

function adminOrderDetailsCard(o){
  const paid=String(o.paymentStatus||"").toUpperCase()==="PAID";
  const status=normalizeTrackingStatus(o.trackingStatus,paid);
  const opts=TRACKING_STATUSES.map(s=>`<option value="${s[0]}" ${status===s[0]?"selected":""}>${s[1]}</option>`).join("");
  const date=o.createdAt?orderDateText(o.createdAt):"";
  const otp=o.deliveryOtp||"";
  const items=Array.isArray(o.items)?o.items:[];
  const itemList=items.map(item=>{
    const product=products.find(p=>String(p.id)===String(item.productId||""));
    const image=String(item.image || product?.image || "");
    const imageHtml=image
      ? `<img src="${esc(image)}" alt="${esc(item.name||"Product")}" class="admin-order-product-image" onerror="this.style.display='none'">`
      : `<div class="admin-order-product-placeholder">📦</div>`;
    return `<div class="admin-order-product-row">
      <div class="admin-order-product-thumb">${imageHtml}</div>
      <div class="admin-order-product-info">
        <strong>${esc(item.name||"Product")}</strong>
        <span>Qty ${Number(item.quantity||1)} × ${money(item.price||0)}</span>
      </div>
      <strong>${money(item.subtotal || Number(item.price||0)*Number(item.quantity||1))}</strong>
    </div>`;
  }).join("");

  return `<div class="admin-order-expanded">
    <div class="admin-order-detail-top">
      <div>
        <div class="admin-detail-label">Order</div>
        <strong>${esc(orderDisplayId(o.id))}</strong>
        <span class="admin-detail-muted">${esc(date)}</span>
      </div>
      <div>${adminStatusBadge(status,paid)}</div>
    </div>

    <div class="admin-order-detail-grid">
      <div>
        <span class="admin-detail-label">Payment</span>
        <strong>${paid ? "PAID" : "PAYMENT REQUIRED"}</strong>
      </div>
      <div>
        <span class="admin-detail-label">Total</span>
        <strong>${money(o.totalAmount||0)}</strong>
      </div>
      <div>
        <span class="admin-detail-label">Delivery</span>
        <strong>${o.deliveryMethod==="OFFICE" ? "Office Delivery • FREE" : "Home Delivery • ₹50"}</strong>
      </div>
      <div>
        <span class="admin-detail-label">WhatsApp</span>
        <strong>${esc(o.whatsapp||"—")}</strong>
      </div>
    </div>

    <div class="admin-order-items">
      <div class="admin-detail-label">Products</div>
      ${itemList || '<div class="admin-detail-muted">Order items unavailable.</div>'}
    </div>

    <div class="admin-controls">
      <div>
        <label>Status</label>
        <select id="admin-status-${esc(o.id)}">${opts}</select>
      </div>
      <div>
        <label>Delivery Date</label>
        <input id="admin-date-${esc(o.id)}" type="date" value="${esc(o.estimatedDeliveryDate||"")}">
      </div>
      <div>
        <label>Time Range</label>
        <input id="admin-time-${esc(o.id)}" type="text" placeholder="5:00 PM–7:00 PM"
          value="${esc((o.estimatedDeliveryStart&&o.estimatedDeliveryEnd)?o.estimatedDeliveryStart+"–"+o.estimatedDeliveryEnd:"")}">
      </div>
      <button class="admin-btn" onclick="saveAdminOrder('${esc(o.id)}')">Save</button>
    </div>

    ${status==="DELIVERED" || status==="CANCELLED" ? "" : `
    <div class="admin-otp">
      <strong>Delivery OTP:</strong>
      ${otp
        ? `<span class="otp-value">${esc(otp)}</span>`
        : `<span class="admin-detail-muted">Not generated</span>`}
      <button class="admin-btn light" onclick="generateDeliveryOtp('${esc(o.id)}')">
        ${otp?"Regenerate OTP":"Generate OTP"}
      </button>
      ${otp
        ? `<input id="verify-otp-${esc(o.id)}" inputmode="numeric" maxlength="4" placeholder="Enter OTP">
           <button class="admin-btn" onclick="verifyDeliveryOtp('${esc(o.id)}')">Verify & Deliver</button>`
        : ""}
    </div>`}
  </div>`;
}

function adminOrderCard(o){
  const paid=String(o.paymentStatus||"").toUpperCase()==="PAID";
  const status=normalizeTrackingStatus(o.trackingStatus,paid);
  const customer=String(o.customerName||"Customer").trim() || "Customer";
  return `<article class="admin-customer-group">
    <button class="admin-customer-head" type="button" onclick="toggleAdminCustomer('${esc(o._groupKey)}')">
      <span class="admin-customer-main">
        <span class="admin-customer-name">${esc(customer)}</span>
        <span class="admin-customer-latest">Latest: ${esc(orderDisplayId(o.id))}</span>
      </span>
      <span class="admin-customer-right">
        ${adminStatusBadge(status,paid)}
        <span class="admin-order-count">${Number(o._groupCount||1)} ${Number(o._groupCount||1)===1?"Order":"Orders"}</span>
        <span class="admin-chevron" id="adminChevron-${esc(o._groupKey)}">⌄</span>
      </span>
    </button>
    <div id="adminCustomer-${esc(o._groupKey)}" class="admin-customer-orders" style="display:none">
      ${o._groupOrdersHtml || adminOrderDetailsCard(o)}
    </div>
  </article>`;
}

function buildAdminCustomerGroups(orders){
  const groups=new Map();
  orders.forEach(order=>{
    const key=String(order.userId || order.customerEmail || order.whatsapp || order.customerName || order.id);
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(order);
  });

  return Array.from(groups.entries()).map(([key,list])=>{
    list.sort((a,b)=>{
      const ad=a.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.createdAt||0).getTime()||0);
      const bd=b.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.createdAt||0).getTime()||0);
      return bd-ad;
    });
    return {key,list};
  });
}

function renderAdminCustomerGroup(group, autoOpen=false){
  const latest=group.list[0];
  const paid=String(latest.paymentStatus||"").toUpperCase()==="PAID";
  const status=normalizeTrackingStatus(latest.trackingStatus,paid);
  const groupKey=btoa(unescape(encodeURIComponent(group.key))).replace(/[^a-zA-Z0-9]/g,"").slice(0,30) || "customer";
  const rows=group.list.map(o=>{
    const opaid=String(o.paymentStatus||"").toUpperCase()==="PAID";
    const ostatus=normalizeTrackingStatus(o.trackingStatus,opaid);
    return `<div class="admin-order-row">
      <div class="admin-order-row-main">
        <strong>${esc(orderDisplayId(o.id))}</strong>
        <span>${esc(orderDateText(o.createdAt))}</span>
      </div>
      <div class="admin-order-row-right">
        ${adminStatusBadge(ostatus,opaid)}
        <strong>${money(o.totalAmount||0)}</strong>
        <button class="admin-btn light admin-manage-btn" type="button"
          onclick="toggleAdminOrderDetails('${esc(o.id)}')">Manage</button>
      </div>
    </div>
    <div id="adminOrderDetails-${esc(o.id)}" class="admin-order-details-wrap" style="display:none">
      ${adminOrderDetailsCard(o)}
    </div>`;
  }).join("");

  return `<article class="admin-customer-group">
    <button class="admin-customer-head" type="button" onclick="toggleAdminCustomer('${esc(groupKey)}')">
      <span class="admin-customer-main">
        <span class="admin-customer-name">${esc(String(latest.customerName||"Customer"))}</span>
        <span class="admin-customer-latest">${esc(orderDisplayId(latest.id))}</span>
      </span>
      <span class="admin-customer-right">
        ${adminStatusBadge(status,paid)}
        <span class="admin-order-count">${group.list.length} ${group.list.length===1?"Order":"Orders"}</span>
        <span class="admin-chevron" id="adminChevron-${esc(groupKey)}">⌄</span>
      </span>
    </button>
    <div id="adminCustomer-${esc(groupKey)}" class="admin-customer-orders" style="display:${autoOpen?"block":"none"}">
      ${rows}
    </div>
  </article>`;
}

function toggleAdminCustomer(groupKey){
  const el=document.getElementById("adminCustomer-"+groupKey);
  const arrow=document.getElementById("adminChevron-"+groupKey);
  if(!el)return;
  const open=el.style.display!=="none";
  el.style.display=open?"none":"block";
  if(arrow)arrow.textContent=open?"⌄":"⌃";
}

function toggleAdminOrderDetails(orderId){
  const el=document.getElementById("adminOrderDetails-"+orderId);
  if(!el)return;
  el.style.display=el.style.display==="none"?"block":"none";
}

function renderAdminOrders(orders){
  const box=document.getElementById("adminOrdersContent");
  if(!box)return;
  if(!orders.length){
    box.innerHTML='<div class="orders-empty">No orders found.</div>';
    return;
  }
  filterAdminOrders();
}

function filterAdminOrders(){
  const box=document.getElementById("adminOrdersContent");
  if(!box)return;

  const q=(document.getElementById("adminOrderSearch")?.value||"").trim().toLowerCase();
  const f=(document.getElementById("adminOrderFilter")?.value||"ALL").toUpperCase();

  let filtered=adminOrdersCache.filter(o=>{
    const status=normalizeTrackingStatus(
      o.trackingStatus,
      String(o.paymentStatus||"").toUpperCase()==="PAID"
    );
    const pay=String(o.paymentStatus||"").toUpperCase();
    const searchText=[
      orderDisplayId(o.id),
      o.customerName,
      o.whatsapp,
      o.customerEmail
    ].join(" ").toLowerCase();

    const matchFilter=
      f==="ALL" ||
      (f==="PENDING" && pay!=="PAID") ||
      status===f;

    return matchFilter && (!q || searchText.includes(q));
  });

  const groups=buildAdminCustomerGroups(filtered);

  if(!groups.length){
    box.innerHTML='<div class="orders-empty">No matching orders.</div>';
    return;
  }

  box.innerHTML=groups.map(group=>{
    const shouldOpen=!!q;
    return renderAdminCustomerGroup(group,shouldOpen);
  }).join("");
}
async function saveAdminOrder(orderId){
  try{
    const status=normalizeTrackingStatus(
      document.getElementById("admin-status-"+orderId)?.value||"CONFIRMED",
      true
    );
    const date=document.getElementById("admin-date-"+orderId)?.value||"";
    const time=document.getElementById("admin-time-"+orderId)?.value||"";
    let start="",end="";
    if(time.includes("–")){[start,end]=time.split("–").map(s=>s.trim());}
    else if(time.includes("-")){[start,end]=time.split("-").map(s=>s.trim());}
    const data={trackingStatus:status,updatedAt:serverTimestamp()};
    if(date)data.estimatedDeliveryDate=date;
    if(start)data.estimatedDeliveryStart=start;
    if(end)data.estimatedDeliveryEnd=end;
    if(status==="CANCELLED") data.status="CANCELLED";
    else data.status="CONFIRMED";
    const idToken=await currentUser.getIdToken();
    const res=await fetch(PAYMENT_WORKER_URL+"/admin/order/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,orderId,...data,estimatedDeliveryDate:date,estimatedDeliveryStart:start,estimatedDeliveryEnd:end,trackingStatus:status})});
    const result=await res.json();
    if(!res.ok || !result.success) throw new Error(result.error||"Could not update order.");
    showToast("Order updated.","success");
    await loadAdminOrders();
  }catch(e){console.error(e);showToast(e.message||"Could not update order.","error");}
}
async function generateDeliveryOtp(orderId){
  try{
    const idToken=await currentUser.getIdToken();
    const res=await fetch(PAYMENT_WORKER_URL+"/admin/order/generate-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,orderId})});
    const result=await res.json();
    if(!res.ok || !result.success) throw new Error(result.error||"Could not generate OTP.");
    showToast("Delivery OTP generated.","success");
    await loadAdminOrders();
  }catch(e){console.error(e);showToast(e.message||"Could not generate OTP.","error");}
}
async function verifyDeliveryOtp(orderId){
  try{
    const input=document.getElementById("verify-otp-"+orderId)?.value.trim();
    if(!/^\d{4}$/.test(input)){showToast("Enter the 4-digit delivery OTP.","error");return;}
    const idToken=await currentUser.getIdToken();
    const res=await fetch(PAYMENT_WORKER_URL+"/admin/order/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,orderId,otp:input})});
    const result=await res.json();
    if(!res.ok || !result.success) throw new Error(result.error||"Could not verify OTP.");
    showToast("Delivery verified. Order marked Delivered.","success");
    await loadAdminOrders();
  }catch(e){console.error(e);showToast(e.message||"Could not verify OTP.","error");}
}
function goAdmin(){ openAdmin(); }


document.addEventListener("click",event=>{
  const menu=document.getElementById("accountMenu");
  const btn=document.getElementById("accountBtn");
  if(currentUser && menu.classList.contains("show") && !menu.contains(event.target) && !btn.contains(event.target)){
    menu.classList.remove("show");
  }
});

onAuthStateChanged(auth, async user => {
  await updateAccountUI(user);

  if(user){
    // These are account-sync operations, not authentication operations.
    // A Firestore permission/network problem must not turn a successful login into an error.
    try{
      await ensureUserProfile();
      await loadCartFromAccount();
    }catch(e){
      console.error("RoboMart: Account/cart sync failed (authentication is still successful):",e);
      showToast("Logged in successfully. Account sync is temporarily unavailable.","error");
    }
    handlePaymentReturn();
  }
});


function handlePaymentReturn(){
  const params = new URLSearchParams(window.location.search);
  if(params.get("payment") !== "success") return;

  // Razorpay has returned the customer to RoboMart after payment.
  // The webhook remains the authoritative server-side confirmation.
  if(currentUser){
    setTimeout(() => {
      showToast("Payment completed. Checking your order confirmation...","success");
      openOrders();
    }, 700);
  }

  // Keep the URL clean after handling the return.
  try{
    window.history.replaceState({}, document.title, window.location.pathname);
  }catch(e){}
}

function openCart(){document.getElementById("cartDrawer").classList.add("open");document.getElementById("overlay").classList.add("show");renderCart();}
function closeCart(){document.getElementById("cartDrawer").classList.remove("open");document.getElementById("overlay").classList.remove("show");}

async function openProfile(){
  if(!currentUser){
    openAuth("login");
    return;
  }

  try{
    const snap = await getDoc(doc(db,"users",currentUser.uid));
    const data = snap.exists() ? snap.data() : {};

    document.getElementById("profileName").value =
      data.name || currentUser.displayName || "";
    document.getElementById("profileEmail").value =
      currentUser.email || data.email || "";
    document.getElementById("profileWhatsapp").value =
      data.whatsapp || "";
    document.getElementById("profileAddress").value =
      data.address || "";

    const msg=document.getElementById("profileMessage");
    msg.textContent="";
    msg.className="auth-message";

    document.getElementById("profileModal").classList.add("show");
    document.body.style.overflow="hidden";
    const menu=document.getElementById("accountMenu");
    if(menu) menu.classList.remove("show");
  }catch(e){
    console.error("Profile load:",e);
    showToast("Could not load your profile. Please try again.","error");
  }
}

function closeProfile(){
  const modal=document.getElementById("profileModal");
  if(modal) modal.classList.remove("show");
  if(!document.querySelector(".product-modal.show") &&
     !document.getElementById("authModal").classList.contains("show")){
    document.body.style.overflow="";
  }
}

async function saveProfile(event){
  event.preventDefault();
  if(!currentUser){
    showToast("Please login to update your profile.","error");
    closeProfile();
    openAuth("login");
    return;
  }

  const name=document.getElementById("profileName").value.trim();
  const whatsapp=document.getElementById("profileWhatsapp").value.replace(/\D/g,"");
  const address=document.getElementById("profileAddress").value.trim();

  if(!/^[6-9]\d{9}$/.test(whatsapp)){
    showToast("Please enter a valid 10-digit WhatsApp number.","error");
    return;
  }

  try{
    await setDoc(
      doc(db,"users",currentUser.uid),
      {
        name,
        email:currentUser.email || "",
        whatsapp,
        address,
        updatedAt:Date.now()
      },
      {merge:true}
    );

    if(name && name !== (currentUser.displayName || "")){
      try{ await updateProfile(currentUser,{displayName:name}); }catch(e){
        console.warn("Auth display name update:",e);
      }
    }

    await updateAccountUI(currentUser);
    closeProfile();
    showToast("Profile updated successfully.","success");
  }catch(e){
    console.error("Profile save:",e);
    showToast("Could not update your profile. Please try again.","error");
  }
}

async function getCustomerProfile(){
  if(!currentUser) return null;
  const snap=await getDoc(doc(db,"users",currentUser.uid));
  return snap.exists() ? snap.data() : {};
}


function orderDisplayId(orderId){
  return "RM-" + String(orderId).slice(-8).toUpperCase();
}

function orderDateText(value){
  if(!value) return "Date unavailable";
  try{
    const d = value.toDate ? value.toDate() : new Date(value);
    return d.toLocaleString("en-IN",{
      day:"2-digit",month:"short",year:"numeric",
      hour:"2-digit",minute:"2-digit"
    });
  }catch(e){
    return "Date unavailable";
  }
}

function orderStatusInfo(order){
  const payment = String(order.paymentStatus || "").toUpperCase();
  const status = String(order.status || "").toUpperCase();

  if(payment === "PAID"){
    return {
      cls:"paid",
      label:"Payment Received",
      confirmed:true
    };
  }

  if(payment === "FAILED"){
    return {
      cls:"failed",
      label:"Payment Failed",
      confirmed:false
    };
  }

  if(status === "CANCELLED"){
    return {
      cls:"failed",
      label:"Order Cancelled",
      confirmed:false
    };
  }

  return {
    cls:"pending",
    label:"Payment Pending",
    confirmed:false
  };
}

function renderTracking(order){
  const rawStatus=String(
    order.trackingStatus ||
    (String(order.paymentStatus||"").toUpperCase()==="PAID" ? "CONFIRMED" : "PLACED")
  ).toUpperCase();
  const status=normalizeTrackingStatus(rawStatus, String(order.paymentStatus||"").toUpperCase()==="PAID");

  const cancelled=status==="CANCELLED";
  const steps=cancelled
    ? [
        ["PLACED","Order Placed"],
        ["CONFIRMED","Order Confirmed"],
        ["CANCELLED","Cancelled"]
      ]
    : [
        ["PLACED","Order Placed"],
        ["CONFIRMED","Order Confirmed"],
        ["DISPATCHED","Dispatched"],
        ["OUT_FOR_DELIVERY","Out for Delivery"],
        ["DELIVERED","Delivered"]
      ];

  const idx=Math.max(0,steps.findIndex(s=>s[0]===status));
  const items=steps.map((s,i)=>{
    const done=i<idx || (i===idx && status==="DELIVERED");
    const current=i===idx && !done;
    return `<div class="track-item ${done?"done":""} ${current?"current":""} ${s[0]==="CANCELLED"?"cancelled":""}">
      <div class="track-dot">${done?"✓":(s[0]==="CANCELLED"?"×":i+1)}</div>
      <div class="track-label">${s[1]}</div>
    </div>`;
  }).join("");

  let eta="";
  if(order.estimatedDeliveryDate && !cancelled && status!=="DELIVERED"){
    const date=new Date(order.estimatedDeliveryDate+"T00:00:00");
    const d=isNaN(date.getTime())
      ? order.estimatedDeliveryDate
      : date.toLocaleDateString("en-IN",{day:"numeric",month:"short"});
    const time=order.estimatedDeliveryStart&&order.estimatedDeliveryEnd
      ? `, ${order.estimatedDeliveryStart}–${order.estimatedDeliveryEnd}`
      : "";
    eta=`<div class="track-eta">🕐 Expected delivery: ${esc(d)}${esc(time)}</div>`;
  }

  const otp=order.deliveryOtp && status!=="DELIVERED" && status!=="CANCELLED"
    ? `<div class="delivery-otp">🔐 Delivery OTP: <strong style="font-size:16px;letter-spacing:2px">${esc(order.deliveryOtp)}</strong><br><span style="font-weight:600;font-size:10px">Share this OTP with the delivery person only when receiving your order.</span></div>`
    : "";

  return `<div class="track-box ${cancelled?"track-cancelled":""}">
    <div class="track-title">Order Tracking</div>
    <div class="track-line">${items}</div>
    ${eta}${otp}
  </div>`;
}

function renderOrders(orders){
  const box=document.getElementById("ordersContent");
  if(!box) return;

  if(!orders.length){
    box.innerHTML=`<div class="orders-empty">
      <div style="font-size:44px;margin-bottom:10px">📦</div>
      <strong>No orders yet</strong>
      <p style="font-size:12px;margin-top:6px">Your RoboMart orders will appear here.</p>
    </div>`;
    return;
  }

  const confirmedOrders=orders.filter(
    o=>String(o.paymentStatus||"").toUpperCase()==="PAID"
  );
  const pendingOrders=orders.filter(
    o=>String(o.paymentStatus||"").toUpperCase()!=="PAID"
  );

  function buildOrderCard(order,confirmed){
    const id=String(order.id||"");
    const displayId=orderDisplayId(id);
    const items=Array.isArray(order.items)?order.items:[];
    const total=Number(order.totalAmount||0);
    const address=order.deliveryAddress||order.address||"No address saved";
    const paymentId=order.razorpayPaymentId||"";
    const paidAt=order.paidAt?orderDateText(order.paidAt):"";

    const itemHtml=items.map(item=>{
      const product=products.find(
        p=>String(p.id)===String(item.productId||"")
      );
      const image=String(item.image || product?.image || "");

      const imageHtml=image
        ? `<img class="order-product-image"
             src="${esc(image)}"
             alt="${esc(item.name||"Product")}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
           <div class="order-product-placeholder" style="display:none">📦</div>`
        : `<div class="order-product-placeholder">📦</div>`;

      const subtotal=Number(
        item.subtotal ||
        (Number(item.price||0)*Number(item.quantity||1))
      );

      return `<div class="order-item">
        <div class="order-item-product">
          <div class="order-product-thumb">${imageHtml}</div>
          <div class="order-item-info">
            <div class="order-item-name">${esc(item.name||"Product")}</div>
            <div class="order-item-meta">
              Qty ${Number(item.quantity||1)} × ${money(item.price||0)}
            </div>
          </div>
        </div>
        <strong>${money(subtotal)}</strong>
      </div>`;
    }).join("");

    const statusHtml=confirmed
      ? `<span class="order-status paid">Payment Received</span>`
      : `<span class="order-status pending">Payment Required</span>`;

    const messageHtml=confirmed
      ? `<div class="order-confirmed">✓ Payment received. <strong>Order confirmed.</strong></div>`
      : `<div class="order-pending">⚠ Payment has not been completed for this order.</div>`;

    const payButton=!confirmed&&order.razorpayPaymentLink
      ? `<button class="order-action"
          onclick="openPaymentLink('${esc(order.razorpayPaymentLink)}')">Pay Now</button>`
      : "";

    const trackingStatus=normalizeTrackingStatus(
      order.trackingStatus ||
      (confirmed ? "CONFIRMED" : "PLACED"),
      confirmed
    );

    const trackButton=confirmed
      ? `<button class="order-action"
          onclick="toggleOrderTracking('${esc(id)}')">
          ${trackingStatus==="DELIVERED" ? "View Delivery Status" : "Track Order"}
        </button>`
      : "";

    return `<article class="order-card ${
      confirmed ? "confirmed-card" : "pending-card"
    }">
      <div class="order-card-head">
        <div>
          <div class="order-number">${esc(displayId)}</div>
          <div class="order-date">${esc(orderDateText(order.createdAt))}</div>
          ${statusHtml}
        </div>
        <div class="order-total">${money(total)}</div>
      </div>

      <div class="order-card-body">
        ${messageHtml}

        <div class="order-items">
          ${itemHtml || `<div class="order-item">
            <span class="order-item-name">Order items unavailable</span>
          </div>`}
        </div>

        <div id="orderTracking-${esc(id)}"
             class="customer-tracking"
             style="display:none">
          ${confirmed ? renderTracking(order) : ""}
        </div>

        <div class="order-actions">
          <button class="order-action light"
            onclick="toggleOrderDetails('${esc(id)}')">
            View Details
          </button>
          ${trackButton}
          ${payButton}
        </div>

        <div id="orderDetails-${esc(id)}" style="display:none">
          <div class="order-detail-grid">
            <div class="order-detail-section">
              <h4>Delivery</h4>
              <p>${esc(
                order.deliveryMethod==="OFFICE"
                  ? "Office Delivery (Ahilyanagar)"
                  : "Home Delivery"
              )}
${esc(
  order.deliveryMethod==="OFFICE"
    ? "Free Office Delivery"
    : address
)}</p>
            </div>
            <div class="order-detail-section">
              <h4>Payment</h4>
              <p>${confirmed
                ? "Payment Received"
                : "Payment Not Completed"
              }${paymentId ? `\nPayment ID: ${esc(paymentId)}` : ""}${paidAt ? `\nPaid: ${esc(paidAt)}` : ""}</p>
            </div>
          </div>
        </div>
      </div>
    </article>`;
  }

  const confirmedHtml=confirmedOrders.length
    ? `<section class="orders-section confirmed-orders-section">
        <div class="orders-section-title confirmed-title">
          <span>✓ My Confirmed Orders</span>
          <span class="count">${confirmedOrders.length}</span>
        </div>
        <div class="orders-list">
          ${confirmedOrders.map(o=>buildOrderCard(o,true)).join("")}
        </div>
      </section>`
    : "";

  const pendingHtml=pendingOrders.length
    ? `<section class="orders-section pending-orders-section">
        <div class="orders-section-title pending-title">
          <span>⚠ Payment Required</span>
          <span class="count">${pendingOrders.length}</span>
        </div>
        <div class="orders-section-note">
          These orders are waiting for payment and are not confirmed.
        </div>
        <div class="orders-list">
          ${pendingOrders.map(o=>buildOrderCard(o,false)).join("")}
        </div>
      </section>`
    : "";

  box.innerHTML=confirmedHtml+pendingHtml;
}

function toggleOrderTracking(orderId){
  const el=document.getElementById("orderTracking-" + orderId);
  if(!el) return;
  const hidden=el.style.display==="none" || !el.style.display;
  el.style.display=hidden ? "block" : "none";
}

function toggleOrderDetails(orderId){
  const el = document.getElementById("orderDetails-" + orderId);
  if(!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
}

function openPaymentLink(url){
  if(url) window.open(url,"_blank");
}

let ordersUnsubscribe = null;

function closeOrders(){
  if(ordersUnsubscribe){
    ordersUnsubscribe();
    ordersUnsubscribe = null;
  }

  const modal = document.getElementById("ordersModal");
  if(modal) modal.classList.remove("show");

  if(!document.querySelector(".product-modal.show") &&
     !document.getElementById("authModal").classList.contains("show")){
    document.body.style.overflow="";
  }
}

function openOrders(){
  if(!currentUser){
    openAuth("login");
    return;
  }

  const modal = document.getElementById("ordersModal");
  const box = document.getElementById("ordersContent");
  const menu = document.getElementById("accountMenu");

  if(menu) menu.classList.remove("show");

  modal.classList.add("show");
  document.body.style.overflow="hidden";
  box.innerHTML = '<div class="orders-loading">Loading your orders...</div>';

  if(ordersUnsubscribe){
    ordersUnsubscribe();
    ordersUnsubscribe = null;
  }

  try{
    const ordersQuery = query(
      collection(db,"orders"),
      where("userId","==",currentUser.uid)
    );

    ordersUnsubscribe = onSnapshot(
      ordersQuery,
      snap => {
        const orders = snap.docs.map(d => ({
          id:d.id,
          ...d.data()
        }));

        orders.sort((a,b) => {
          const ad = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const bd = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return bd - ad;
        });

        renderOrders(orders);
      },
      error => {
        console.error("Orders listener:",error);
        box.innerHTML = `
          <div class="orders-empty">
            <strong>Unable to load orders</strong>
            <p style="font-size:12px;margin-top:6px">Please try again in a moment.</p>
          </div>`;
      }
    );
  }catch(e){
    console.error("Open orders:",e);
    box.innerHTML = `
      <div class="orders-empty">
        <strong>Unable to load orders</strong>
        <p style="font-size:12px;margin-top:6px">${esc(e.message || "Please try again.")}</p>
      </div>`;
  }
}

async function checkout(){
  if(!cart.length){
    showToast("Your cart is empty.","error");
    return;
  }

  if(!currentUser){
    showToast("Please login or create an account to place your order. Your cart will be saved.","error");
    setTimeout(() => openAuth("login"), 250);
    return;
  }

  try{
    const profile=await getCustomerProfile();
    const deliveryMethod=getSelectedDeliveryMethod();

    if(deliveryMethod==="HOME" && !profile.address){
      showToast("Please add your delivery address in your Profile for Home Delivery.","error");
      setTimeout(() => openProfile(),300);
      return;
    }

    showToast("Creating your order...","success");

    const orderId=await createPendingOrder(profile);
    const idToken=await currentUser.getIdToken();

    showToast("Creating secure payment link...","success");

    const paymentResponse=await fetch(PAYMENT_WORKER_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({orderId,idToken})
    });

    let paymentData={};
    try{
      paymentData=await paymentResponse.json();
    }catch(e){
      throw new Error("Payment server returned an invalid response.");
    }

    if(!paymentResponse.ok || !paymentData.success){
      throw new Error(
        paymentData.error ||
        "Could not create the Razorpay payment link."
      );
    }

    const paymentLink=paymentData.paymentLink;
    if(!paymentLink){
      throw new Error("Payment link was not returned.");
    }

    closeCart();
    window.location.href=paymentLink;

  }catch(e){
    console.error("Create order/payment:",e);
    showToast(
      e.message ||
      "Could not create your order. Please try again.",
      "error"
    );
  }
}

async function createPendingOrder(profile){
  if(!currentUser) throw new Error("Customer is not logged in.");

  const items=cart.map(item=>{
    const p=products.find(x=>String(x.id)===String(item.id));
    if(!p)throw new Error("A product in your cart is no longer available.");

    const qty=Number(item.qty||1);
    const price=Number(p.price||0);

    return {
      productId:String(p.id),
      name:String(p.name||"Product"),
      price,
      quantity:qty,
      subtotal:price*qty,
      image:String(p.image || "")
    };
  });

  const itemsTotal=items.reduce((sum,item)=>sum+item.subtotal,0);
  const deliveryMethod=getSelectedDeliveryMethod();
  const deliveryCharge=deliveryMethod==="HOME" ? 50 : 0;
  const totalAmount=itemsTotal+deliveryCharge;
  const deliveryAddress=deliveryMethod==="HOME" ? (profile.address||"") : "";

  const orderData={
    userId:currentUser.uid,
    customerName:profile.name||currentUser.displayName||"Customer",
    customerEmail:currentUser.email||"",
    whatsapp:String(profile.whatsapp||"").replace(/\D/g,""),
    address:deliveryAddress,
    deliveryAddress,
    deliveryMethod,
    deliveryCharge,
    itemsTotal,
    items,
    totalAmount,
    currency:"INR",
    status:"PENDING_PAYMENT",
    paymentStatus:"PENDING",
    razorpayPaymentLink:"",
    razorpayPaymentLinkId:"",
    createdAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  };

  const ref=await addDoc(collection(db,"orders"),orderData);
  return ref.id;
}

Object.assign(window,{openProfile,saveProfile,closeProfile,openOrders,closeOrders,openPaymentLink,toggleOrderDetails,displayProducts,handleSearchInput,handleSearchKeydown,submitSearch,selectSearchSuggestion,filterCategory,clearFilter,addToCart,changeQty,openCart,closeCart,checkout,openProduct,closeProduct,detailQtyChange,addProductFromDetail,openAuth,closeAuth,showAuthTab,loginUser,loginWithGoogle,registerUser,resetPassword,logoutUser,toggleAccountMenu,goAdmin,openAdmin,closeAdmin,showAdminSection,filterAdminOrders,saveAdminOrder,generateDeliveryOtp,verifyDeliveryOtp,updateDeliveryTotal,toggleOrderTracking,toggleAdminCustomer,toggleAdminOrderDetails});
renderCart();
loadProducts();